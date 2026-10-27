import { constants, closeSync, existsSync, fstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const credentialKeys = ['ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN', 'ORBIT_EVAL_BUDGET_TOKEN']
const readiness = new Map()
const credentialHistory = new Set()

async function waitForHealthyApi(origin) {
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.min(60000, deadline - Date.now())),
      })
      if (response.ok) {
        const health = await response.json()
        if (health.status === 'Healthy') return health
      }
    } catch {
      // Health probes are safe to retry before submitting a rotating refresh.
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(2000, remaining)))
  }
  throw new Error('API did not become Healthy within the bounded startup wait; no refresh was sent.')
}

export async function healthyApi({ fresh = false } = {}) {
  const origin = apiOrigin()
  const key = `${origin}:${process.env.ORBIT_EVAL_CREDENTIALS_FILE}`
  if (fresh || !readiness.has(key)) readiness.set(key, waitForHealthyApi(origin))
  try { return await readiness.get(key) } catch (error) { readiness.delete(key); throw error }
}

export function apiOrigin() {
  const origin = new URL(process.env.ORBIT_EVAL_BASE_URL)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== '/') throw new Error('ORBIT_EVAL_BASE_URL must be an HTTPS origin without credentials or a path.')
  return origin.origin
}

export function readCredentials() {
  const path = process.env.ORBIT_EVAL_CREDENTIALS_FILE
  if (!path) throw new Error('Missing ORBIT_EVAL_CREDENTIALS_FILE.')
  let descriptor
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const status = fstatSync(descriptor)
    if (!status.isFile() || (status.mode & 0o777) !== 0o600 || status.uid !== process.getuid()) {
      throw new Error('Invalid credentials permissions.')
    }
    const credentials = JSON.parse(readFileSync(descriptor, 'utf8'))
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw new Error('Invalid credentials format.')
    return credentials
  } catch {
    throw new Error('Credentials file must be valid JSON, owned by this user, and a regular file with mode 600.')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export function redactCredentials(text) {
  const secrets = credentialKeys.map((key) => process.env[key])
  secrets.push(process.env.OPENAI_API_KEY)
  secrets.push(process.env.ORBIT_EVAL_CREDENTIALS_FILE)
  try { secrets.push(...Object.values(readCredentials()).flatMap((account) => Object.values(account))) } catch {
    // An unreadable credential file already produces a message without its contents.
  }
  for (const secret of secrets.filter((value) => typeof value === 'string' && value.length)) credentialHistory.add(secret)
  let message = text
  for (const secret of [...credentialHistory].sort((a, b) => b.length - a.length)) {
    message = message.replaceAll(secret, '[redacted]')
  }
  return message
}

export function safeFailureMessage(error) {
  return redactCredentials(error instanceof Error ? error.message : 'Unknown precondition failure.').replace(/[\r\n]/g, ' ')
}

export async function updateCredentials(update) {
  const path = process.env.ORBIT_EVAL_CREDENTIALS_FILE
  readCredentials()
  let lock
  try { lock = openSync(`${path}.lock`, 'wx', 0o600) } catch {
    throw new Error('Credentials are locked by another run; use one serial runner.')
  }
  const replacement = `${path}.${randomUUID()}`
  try {
    const credentials = readCredentials()
    const result = await update(credentials)
    writeFileSync(replacement, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(replacement, path)
    return result
  } finally {
    try { unlinkSync(replacement) } catch (error) { if (error.code !== 'ENOENT') throw error }
    closeSync(lock)
    unlinkSync(`${path}.lock`)
  }
}

export async function refreshCredential(key) {
  if (!credentialKeys.includes(key)) throw new Error('Unknown eval credential key.')
  delete process.env[key]
  try {
    const path = process.env.ORBIT_EVAL_CREDENTIALS_FILE
    if (!path) throw new Error('Missing credentials file.')
    if (existsSync(`${path}.refresh-failed`)) throw new Error('A refresh already failed; recover the session before another run.')
    let rotated = false
    const token = await updateCredentials(async (credentials) => {
      const account = credentials[key]
      if (typeof account?.refreshToken !== 'string' || !account.refreshToken.trim()) throw new Error('Missing refresh token.')
      await healthyApi()
      const refreshUrl = `${apiOrigin()}/api/auth/refresh`
      const refreshOptions = {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'api-version': '2.0' },
        body: JSON.stringify({ refreshToken: account.refreshToken }), redirect: 'error', signal: AbortSignal.timeout(120000),
      }
      writeFileSync(`${path}.refresh-failed`, '', { mode: 0o600, flag: 'wx' })
      let response
      try {
        response = await fetch(refreshUrl, refreshOptions)
      } catch {
        throw new Error('Refresh transport failed; recover the session before another run.')
      }
      if (!response.ok) throw new Error(`Refresh rejected with HTTP ${response.status}.`)
      let session
      try { session = await response.json() } catch { throw new Error('Malformed refresh response.') }
      if (typeof session.token !== 'string' || !session.token.trim()
        || typeof session.refreshToken !== 'string' || !session.refreshToken.trim()) throw new Error('Malformed refresh response.')
      rotated = account.refreshToken !== session.refreshToken
      account.refreshToken = session.refreshToken
      return session.token
    })
    if (rotated) writeFileSync(`${path}.rotated`, '', { mode: 0o600 })
    unlinkSync(`${path}.refresh-failed`)
    process.env[key] = token
  } catch (error) {
    throw new Error(`Credential refresh failed for ${key}; no chat request should run. ${safeFailureMessage(error)}`)
  }
}
