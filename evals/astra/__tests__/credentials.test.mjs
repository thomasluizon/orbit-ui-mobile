import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refreshCredential } from '../credentials.mjs'
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
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
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
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
  const { test } = await beforeEach(attempt())
  expect(test.vars.preconditionFailure).toMatch(/credential|refresh/i)
  expect(test.vars.preconditionFailure).not.toContain('SECRET')
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
  if (['missing', 'permissions'].includes(failure)) expect(request).not.toHaveBeenCalled()
})

it('preserves other accounts and consumes the rotated refresh on the next attempt', async () => {
  const path = credentials()
  const other = { refreshToken: 'other-refresh', habitId: 'other-habit' }
  writeFileSync(path, JSON.stringify({ ORBIT_EVAL_TOKEN: { refreshToken: 'old-refresh' }, ORBIT_EVAL_FREE_TOKEN: other }))
  let refresh = 'old-refresh'
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    expect(JSON.parse(options.body).refreshToken).toBe(refresh)
    refresh += '-rotated'
    return Response.json({ token: 'fresh-access', refreshToken: refresh })
  })
  await refreshCredential('ORBIT_EVAL_TOKEN')
  await refreshCredential('ORBIT_EVAL_TOKEN')
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ ORBIT_EVAL_TOKEN: { refreshToken: refresh }, ORBIT_EVAL_FREE_TOKEN: other })
})
it('rejects a concurrent rotation and never reveals transport secrets', async () => {
  const path = credentials()
  writeFileSync(`${path}.lock`, '', { mode: 0o600 })
  const request = vi.fn(async () => { throw new Error('SECRET_TOKEN') })
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
  await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('Credential refresh failed')
  expect(request).not.toHaveBeenCalled()
  rmSync(`${path}.lock`)
  try { await refreshCredential('ORBIT_EVAL_TOKEN') } catch (error) {
    expect(error.message).not.toContain('SECRET_TOKEN')
  }
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))

it('waits for a healthy cold API before refreshing and reuses readiness across attempts', async () => {
  credentials()
  vi.useFakeTimers()
  const paths = []
  const timeouts = vi.spyOn(AbortSignal, 'timeout')
  vi.stubGlobal('fetch', async (url) => {
    const path = new URL(url).pathname
    paths.push(path)
    if (path === '/health') return Response.json({ status: paths.length === 1 ? 'Unhealthy' : 'Healthy', commit: null, checks: [] }, { status: paths.length === 1 ? 503 : 200 })
    return Response.json({ token: 'fresh-access', refreshToken: 'rotated-refresh' })
  })
  try {
    const pending = refreshCredential('ORBIT_EVAL_TOKEN')
    await vi.advanceTimersByTimeAsync(45000)
    await pending
    await refreshCredential('ORBIT_EVAL_TOKEN')
    expect(paths).toEqual(['/health', '/health', '/api/auth/refresh', '/api/auth/refresh'])
    expect(timeouts.mock.calls.at(-1)[0]).toBeGreaterThanOrEqual(120000)
  } finally { vi.useRealTimers(); timeouts.mockRestore() }
})

it('bounds unhealthy startup without ever submitting a rotating refresh', async () => {
  credentials()
  vi.useFakeTimers()
  const paths = []
  vi.stubGlobal('fetch', async (url) => {
    paths.push(new URL(url).pathname)
    return Response.json({ status: 'Unhealthy', commit: null, checks: [] }, { status: 503 })
  })
  try {
    const pending = refreshCredential('ORBIT_EVAL_TOKEN').catch((error) => error)
    await vi.advanceTimersByTimeAsync(240000)
    expect((await pending).message).toMatch(/healthy|wake/i)
    expect(paths.length).toBeGreaterThan(1)
    expect(paths.every((path) => path === '/health')).toBe(true)
    expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
  } finally { vi.useRealTimers() }
})
