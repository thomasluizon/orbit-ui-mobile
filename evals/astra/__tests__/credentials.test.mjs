import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach } from '../hooks.mjs'

const directories = []
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function credentials(mode = 0o600) {
  const directory = mkdtempSync(join(tmpdir(), 'astra-credentials-'))
  directories.push(directory)
  const path = join(directory, 'credentials.json')
  writeFileSync(path, JSON.stringify({ ORBIT_EVAL_TOKEN: { refreshToken: 'old-refresh' } }), { mode })
  vi.stubEnv('ORBIT_EVAL_CREDENTIALS_FILE', path)
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
  vi.stubEnv('ORBIT_EVAL_RESET_SCRIPT', '/usr/bin/true')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'expired-access')
  return path
}
const attempt = () => ({ test: { metadata: { id: 'refresh-control' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN' } } })
it('refreshes before an attempt and durably rotates only the selected account', async () => {
  const path = credentials()
  const request = vi.fn(async (url, options) => {
    expect(url).toBe('https://astra.invalid/api/auth/refresh')
    expect(options.headers['api-version']).toBe('2.0')
    expect(JSON.parse(options.body)).toEqual({ refreshToken: 'old-refresh' })
    return Response.json({ token: 'fresh-access', refreshToken: 'rotated-refresh' })
  })
  vi.stubGlobal('fetch', request)
  await beforeEach(attempt())
  expect(request).toHaveBeenCalledTimes(1)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('fresh-access')
  expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('rotated-refresh')
  expect(statSync(path).mode & 0o777).toBe(0o600)
})
it.each(['missing', 'permissions', 'rejected', 'malformed', 'network'])('stops before chat when refresh is %s', async (failure) => {
  const path = credentials(failure === 'permissions' ? 0o644 : 0o600)
  if (failure === 'missing') writeFileSync(path, '{}')
  const request = vi.fn(async (url) => {
    expect(url).toContain('/api/auth/refresh')
    if (failure === 'network') throw new Error('SECRET_REFRESH_TOKEN')
    return failure === 'malformed' ? Response.json({ token: 'secret' }) : Response.json({ error: 'SECRET' }, { status: 401 })
  })
  vi.stubGlobal('fetch', request)
  await expect(beforeEach(attempt())).rejects.toThrow(/credential|refresh/i)
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
  if (['missing', 'permissions'].includes(failure)) expect(request).not.toHaveBeenCalled()
})
