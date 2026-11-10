import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './release.ts'

export const submissionsEndpoint = 'https://appstoreconnect.apple.com/notary/v2/submissions'
const submissionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenLifetimeSeconds = 600

export interface NotaryCredentials { keyId: string; issuerId: string; privateKey: string }
export interface NotaryWait {
  credentials: NotaryCredentials
  fetch: typeof fetch
  sleep: (milliseconds: number) => Promise<void>
  now: () => number
  deadline: number
  intervalMilliseconds: number
  write: (line: string) => void
}

export const macosTargets = Object.keys(targets).filter(target => target.endsWith('apple-darwin'))
export const submissionFile = (target: string) => `notary-${target}.json`

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function notaryToken({ keyId, issuerId, privateKey }: NotaryCredentials, now: number) {
  const issuedAt = Math.floor(now / 1000)
  const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({
    iss: issuerId, iat: issuedAt, exp: issuedAt + tokenLifetimeSeconds, aud: 'appstoreconnect-v1',
  })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: createPrivateKey(privateKey), dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${signature.toString('base64url')}`
}

export function readSubmissionId(path: string) {
  const id = (JSON.parse(readFileSync(path, 'utf8')) as { id?: unknown }).id
  if (typeof id !== 'string' || !submissionPattern.test(id)) throw new Error(`${path} names no notary submission id`)
  return id
}

async function printLog(id: string, options: NotaryWait, authorization: string) {
  const location = await options.fetch(`${submissionsEndpoint}/${id}/logs`, { headers: { Authorization: authorization } })
  if (!location.ok) throw new Error(`Notary log lookup for ${id} returned ${location.status}: ${await location.text()}`)
  const url = (await location.json() as { data?: { attributes?: { developerLogUrl?: unknown } } }).data?.attributes?.developerLogUrl
  if (typeof url !== 'string') throw new Error(`Notary log lookup for ${id} returned no developerLogUrl`)
  const log = await options.fetch(url)
  if (!log.ok) throw new Error(`Notary log download for ${id} returned ${log.status}`)
  options.write(`::group::Notary log for ${id}`)
  options.write(await log.text())
  options.write('::endgroup::')
}

type Outcome = 'Accepted' | 'In Progress' | 'Failed' | 'Retry'

async function checkSubmission(id: string, options: NotaryWait, authorization: string): Promise<Outcome> {
  let response: Response
  try {
    response = await options.fetch(`${submissionsEndpoint}/${id}`, { headers: { Authorization: authorization } })
  } catch (error) {
    options.write(`::warning::Notary status for ${id} failed to load, retrying: ${(error as Error).message}`)
    return 'Retry'
  }
  if (response.status === 429 || response.status >= 500) {
    options.write(`::warning::Notary status for ${id} returned ${response.status}, retrying`)
    return 'Retry'
  }
  if (!response.ok) throw new Error(`Notary status for ${id} returned ${response.status}: ${await response.text()}`)
  const data = (await response.json() as { data?: { id?: unknown; attributes?: { status?: unknown } } }).data
  if (typeof data?.id !== 'string' || data.id.toLowerCase() !== id.toLowerCase()) throw new Error(`Notary status for ${id} named another submission`)
  const status = data.attributes?.status
  options.write(`${id}: ${String(status)}`)
  if (status === 'In Progress') return status
  if (status === 'Accepted') {
    await printLog(id, options, authorization)
    return status
  }
  if (status === 'Invalid' || status === 'Rejected') {
    options.write(`::error::Notary submission ${id} finished with status ${status}`)
    await printLog(id, options, authorization)
    return 'Failed'
  }
  throw new Error(`Notary submission ${id} returned unknown status ${String(status)}`)
}

export async function waitForNotarization(ids: string[], options: NotaryWait) {
  const pending = new Set(ids)
  for (;;) {
    const authorization = `Bearer ${notaryToken(options.credentials, options.now())}`
    const failed: string[] = []
    for (const id of [...pending]) {
      const outcome = await checkSubmission(id, options, authorization)
      if (outcome === 'Accepted') pending.delete(id)
      if (outcome === 'Failed') failed.push(id)
    }
    if (failed.length > 0) throw new Error(`Notarization failed for ${failed.join(', ')}`)
    if (pending.size === 0) return
    if (options.now() >= options.deadline) throw new Error(`Notarization is still in progress for ${[...pending].join(', ')}`)
    await options.sleep(options.intervalMilliseconds)
  }
}

function credential(key: string) {
  const value = process.env[key]
  if (!value) throw new Error(`Missing ${key}`)
  return value
}

async function main() {
  const [command, path = '', deadlineMinutes = ''] = process.argv.slice(2)
  if (command === 'submission') {
    process.stdout.write(`${readSubmissionId(path)}\n`)
    return
  }
  if (command !== 'wait' || !/^[1-9]\d*$/.test(deadlineMinutes)) throw new Error('Usage: notary.ts submission <file> | wait <directory> <deadline minutes>')
  const ids = macosTargets.map(target => readSubmissionId(resolve(path, submissionFile(target))))
  await waitForNotarization(ids, {
    credentials: {
      keyId: credential('APP_STORE_CONNECT_API_KEY_ID'),
      issuerId: credential('APP_STORE_CONNECT_API_ISSUER_ID'),
      privateKey: credential('APP_STORE_CONNECT_API_PRIVATE_KEY'),
    },
    fetch,
    sleep: milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds)),
    now: Date.now,
    deadline: Date.now() + Number(deadlineMinutes) * 60_000,
    intervalMilliseconds: 30_000,
    write: line => process.stdout.write(`${line}\n`),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
