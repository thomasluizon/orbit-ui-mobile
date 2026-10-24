import { constants, closeSync, fstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const credentialKeys = ['ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN', 'ORBIT_EVAL_BUDGET_TOKEN']

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
    const token = await updateCredentials(async (credentials) => {
      const account = credentials[key]
      if (typeof account?.refreshToken !== 'string' || !account.refreshToken.trim()) throw new Error('Missing refresh token.')
      const response = await fetch(`${apiOrigin()}/api/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'api-version': '2.0' },
        body: JSON.stringify({ refreshToken: account.refreshToken }), redirect: 'error', signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('Refresh rejected.')
      const session = await response.json()
      if (typeof session.token !== 'string' || !session.token.trim()
        || typeof session.refreshToken !== 'string' || !session.refreshToken.trim()) throw new Error('Malformed refresh response.')
      account.refreshToken = session.refreshToken
      return session.token
    })
    process.env[key] = token
  } catch {
    throw new Error(`Credential refresh failed for ${key}; no chat request should run.`)
  }
}
