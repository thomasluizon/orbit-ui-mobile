import { afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
export function offlineCredentials() {
  const directory = mkdtempSync(join(tmpdir(), 'astra-auth-'))
  directories.push(directory)
  const path = join(directory, 'credentials.json')
  writeFileSync(path, JSON.stringify(Object.fromEntries(
    ['ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN', 'ORBIT_EVAL_BUDGET_TOKEN'].map((key) => [key, { refreshToken: 'offline-refresh' }]),
  )), { mode: 0o600 })
  vi.stubEnv('ORBIT_EVAL_CREDENTIALS_FILE', path)
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubGlobal('fetch', async () => { throw new Error('Unexpected offline HTTP request.') })
  return path
}
export function refreshResponse() {
  return Response.json({ token: 'offline-token', refreshToken: 'offline-refresh' })
}
