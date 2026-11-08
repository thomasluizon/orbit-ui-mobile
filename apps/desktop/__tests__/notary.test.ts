import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
// WHY: Apple's documented examples for Get Submission Status, Get Submission Log, the developer log and ErrorResponse.
import apple from '../__fixtures__/notary-api.json'
import {
  macosTargets, notaryToken, readSubmissionId, submissionFile, submissionsEndpoint, waitForNotarization, type NotaryWait,
} from '../scripts/notary.ts'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const credentials = { keyId: '2X9R4HXF34', issuerId: '57246542-96fe-1a63-e053-0824d011072a', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
const first = apple.status.data.id
const second = '51d6b29b-0000-4000-8000-000000000000'
const logUrl = 'https://notary-artifacts.example/developer-log.json'
const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const statusBody = (id: string, status: string) => ({ ...apple.status, data: { ...apple.status.data, id, attributes: { ...apple.status.data.attributes, status } } })
const logsBody = (id: string) => ({ ...apple.logs, data: { ...apple.logs.data, id, attributes: { developerLogUrl: logUrl } } })

function verifiesToken(token: string) {
  const [header, payload, signature] = token.split('.') as [string, string, string]
  return verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))
}

function service(statuses: Record<string, (Response | Error | string)[]>) {
  const requests: { url: string; authorization: string | null }[] = []
  const sleeps: number[] = []
  const lines: string[] = []
  let clock = 1_700_000_000_000
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
    if (url === logUrl) return json(apple.developerLog)
    const id = url.slice(submissionsEndpoint.length + 1).replace(/\/logs$/, '')
    if (url.endsWith('/logs')) return json(logsBody(id))
    const next = statuses[id]!.length > 1 ? statuses[id]!.shift()! : statuses[id]![0]!
    if (next instanceof Error) throw next
    return typeof next === 'string' ? json(statusBody(id, next)) : next
  }) as typeof globalThis.fetch
  const options: NotaryWait = {
    credentials, fetch, deadline: clock + 60_000, intervalMilliseconds: 30_000,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); clock += milliseconds },
    now: () => clock,
    write: line => lines.push(line),
  }
  return { options, requests, sleeps, lines }
}

it('signs an ES256 App Store Connect team token with a lifetime under twenty minutes', () => {
  const token = notaryToken(credentials, 1_528_407_600_000)
  const [header, payload, signature] = token.split('.') as [string, string, string]
  expect(decode(header)).toEqual({ alg: 'ES256', kid: credentials.keyId, typ: 'JWT' })
  expect(decode(payload)).toEqual({ iss: credentials.issuerId, iat: 1_528_407_600, exp: 1_528_408_200, aud: 'appstoreconnect-v1' })
  expect(Buffer.from(signature, 'base64url')).toHaveLength(64)
  expect(verifiesToken(token)).toBe(true)
})

it('reads only a submission UUID from the notarytool output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-notary-'))
  directories.push(directory)
  const file = join(directory, 'submission.json')
  writeFileSync(file, JSON.stringify({ id: first }))
  expect(readSubmissionId(file)).toBe(first)
  for (const body of [{}, { id: 'not-a-submission' }, { id: 7 }]) {
    writeFileSync(file, JSON.stringify(body))
    expect(() => readSubmissionId(file)).toThrow('names no notary submission id')
  }
})

it('polls each submission with a bearer token until every one is accepted, then prints each log', async () => {
  const { options, requests, sleeps, lines } = service({ [first]: ['In Progress', 'Accepted'], [second]: ['In Progress', 'In Progress', 'Accepted'] })
  await waitForNotarization([first, second], options)
  const statusRequests = requests.filter(request => !request.url.endsWith('/logs') && request.url !== logUrl)
  expect(statusRequests.map(request => request.url)).toEqual([first, second, first, second, second].map(id => `${submissionsEndpoint}/${id}`))
  for (const request of statusRequests) {
    expect(request.authorization).toMatch(/^Bearer /)
    expect(verifiesToken(request.authorization!.slice('Bearer '.length))).toBe(true)
  }
  expect(requests.filter(request => request.url === logUrl).every(request => request.authorization === null)).toBe(true)
  expect(sleeps).toEqual([30_000, 30_000])
  expect(lines.filter(line => line.startsWith('::group::'))).toEqual([`::group::Notary log for ${first}`, `::group::Notary log for ${second}`])
  expect(lines).toContain(JSON.stringify(apple.developerLog))
})

it.each(['Invalid', 'Rejected'])('fails with the developer log when a submission is %s', async (status) => {
  const { options, lines, sleeps } = service({ [first]: [status], [second]: ['In Progress'] })
  await expect(waitForNotarization([first, second], options)).rejects.toThrow(`Notarization failed for ${first}`)
  expect(lines).toContain(`::error::Notary submission ${first} finished with status ${status}`)
  expect(lines).toContain(JSON.stringify(apple.developerLog))
  expect(sleeps).toEqual([])
})

it('retries transport failures, throttling and server errors without failing the wait', async () => {
  const { options, sleeps, lines } = service({ [first]: [new TypeError('fetch failed'), json(apple.error, 503), json(apple.error, 429), 'Accepted'] })
  await waitForNotarization([first], { ...options, deadline: Infinity })
  expect(sleeps).toHaveLength(3)
  expect(lines.filter(line => line.startsWith('::warning::'))).toHaveLength(3)
})

it.each([403, 404])('stops on a %s status response with the service body', async (code) => {
  const { options } = service({ [first]: [json(apple.error, code)] })
  await expect(waitForNotarization([first], options)).rejects.toThrow(`Notary status for ${first} returned ${code}: ${JSON.stringify(apple.error)}`)
})

it('stops at its deadline while a submission is still in progress', async () => {
  const { options, sleeps } = service({ [first]: ['Accepted'], [second]: ['In Progress'] })
  await expect(waitForNotarization([first, second], options)).rejects.toThrow(`Notarization is still in progress for ${second}`)
  expect(sleeps).toEqual([30_000, 30_000])
})

it('refuses a response for another submission or with an unknown status', async () => {
  const foreign = service({ [first]: [json(statusBody(second, 'Accepted'))] })
  await expect(waitForNotarization([first], foreign.options)).rejects.toThrow('named another submission')
  const unknown = service({ [first]: ['Pending'] })
  await expect(waitForNotarization([first], unknown.options)).rejects.toThrow('unknown status Pending')
})

const cli = (args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath,
  ['--experimental-strip-types', fileURLToPath(new URL('../scripts/notary.ts', import.meta.url)), ...args],
  { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })

it('requires a recorded submission for every macOS target before it contacts Apple', () => {
  expect(macosTargets).toEqual(['aarch64-apple-darwin', 'x86_64-apple-darwin'])
  const directory = mkdtempSync(join(tmpdir(), 'orbit-notary-'))
  directories.push(directory)
  writeFileSync(join(directory, submissionFile('aarch64-apple-darwin')), JSON.stringify({ id: first }))
  const missing = cli(['wait', directory, '345'])
  expect(missing.status).not.toBe(0)
  expect(missing.stderr).toContain(submissionFile('x86_64-apple-darwin'))
  writeFileSync(join(directory, submissionFile('x86_64-apple-darwin')), JSON.stringify({ id: second }))
  const unauthenticated = cli(['wait', directory, '345'])
  expect(unauthenticated.status).not.toBe(0)
  expect(unauthenticated.stderr).toContain('Missing APP_STORE_CONNECT_API_KEY_ID')
  expect(cli(['wait', directory]).stderr).toContain('Usage: notary.ts')
  const recorded = cli(['submission', join(directory, submissionFile('x86_64-apple-darwin'))])
  expect(recorded.status, recorded.stderr).toBe(0)
  expect(recorded.stdout).toBe(`${second}\n`)
})
