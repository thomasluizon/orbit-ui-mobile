import { afterEach, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refreshCredential } from '../credentials.mjs'
import { beforeEach } from '../hooks.mjs'

const directories = []
afterEach(() => {
  vi.useRealTimers()
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
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'expired-access')
  return path
}
const attempt = (credentialKey = 'ORBIT_EVAL_TOKEN') => ({ test: { metadata: { id: 'refresh-control' }, vars: { credentialKey } } })
it('refreshes before an attempt and durably rotates only the selected account', async () => {
  const path = credentials()
  const request = vi.fn(async (url, options) => {
    expect(url).toBe('https://orbit-api-staging-uqu2.onrender.com/api/auth/refresh')
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
it.each(['missing', 'permissions', 'rejected', 'malformed'])('stops before chat when refresh is %s', async (failure) => {
  const path = credentials(failure === 'permissions' ? 0o644 : 0o600)
  if (failure === 'missing') writeFileSync(path, '{}')
  const request = vi.fn(async (url) => {
    expect(url).toContain('/api/auth/refresh')
    return failure === 'malformed' ? Response.json({ token: 'secret' }) : Response.json({ error: 'SECRET' }, { status: 401 })
  })
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
  const { test } = await beforeEach(attempt())
  expect(test.vars.preconditionFailure).toMatch(/credential|refresh/i)
  expect(test.vars.preconditionFailure).not.toContain('SECRET')
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
  if (['missing', 'permissions'].includes(failure)) expect(request).not.toHaveBeenCalled()
  expect(existsSync(`${path}.refresh-failed`)).toBe(['rejected', 'malformed'].includes(failure))
  if (['rejected', 'malformed'].includes(failure)) {
    await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('A refresh already failed')
    expect(request).toHaveBeenCalledTimes(1)
    expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('old-refresh')
  }
})

it('keeps missing credentials local between successful rotations of other accounts', async () => {
  const path = credentials()
  vi.stubEnv('ORBIT_EVAL_FREE_TOKEN', 'expired-free-access')
  vi.stubEnv('ORBIT_EVAL_BUDGET_TOKEN', 'expired-budget-access')
  writeFileSync(path, JSON.stringify({ ORBIT_EVAL_TOKEN: { refreshToken: 'old-refresh' },
    ORBIT_EVAL_FREE_TOKEN: {}, ORBIT_EVAL_BUDGET_TOKEN: { refreshToken: 'budget-refresh' } }))
  const request = vi.fn(async (_url, options) => {
    const { refreshToken } = JSON.parse(options.body)
    return Response.json({ token: `${refreshToken}-access`, refreshToken: `${refreshToken}-rotated` })
  })
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
  expect((await beforeEach(attempt())).test.vars).not.toHaveProperty('preconditionFailure')
  const unavailable = (await beforeEach(attempt('ORBIT_EVAL_FREE_TOKEN'))).test
  expect(unavailable.vars.preconditionFailure).toContain('Missing refresh token.')
  expect(process.env.ORBIT_EVAL_FREE_TOKEN).toBeUndefined()
  const healthy = (await beforeEach(attempt('ORBIT_EVAL_BUDGET_TOKEN'))).test
  expect(healthy.vars).not.toHaveProperty('preconditionFailure')
  expect(process.env.ORBIT_EVAL_BUDGET_TOKEN).toBe('budget-refresh-access')
  expect(request.mock.calls.map(([, options]) => JSON.parse(options.body).refreshToken)).toEqual(['old-refresh', 'budget-refresh'])
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ ORBIT_EVAL_TOKEN: { refreshToken: 'old-refresh-rotated' },
    ORBIT_EVAL_FREE_TOKEN: {}, ORBIT_EVAL_BUDGET_TOKEN: { refreshToken: 'budget-refresh-rotated' } })
  expect(existsSync(`${path}.rotated`)).toBe(true)
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
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
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
  rmSync(`${path}.lock`)
  await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('Refresh transport failed')
  expect(request).toHaveBeenCalledTimes(3)
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
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
  const path = credentials()
  vi.useFakeTimers()
  const paths = []
  let healthy = false
  vi.stubGlobal('fetch', async (url) => {
    paths.push(new URL(url).pathname)
    if (healthy) return new URL(url).pathname === '/health'
      ? Response.json({ status: 'Healthy', commit: null, checks: [] })
      : Response.json({ token: 'fresh-access', refreshToken: 'rotated-refresh' })
    return Response.json({ status: 'Unhealthy', commit: null, checks: [] }, { status: 503 })
  })
  try {
    const pending = refreshCredential('ORBIT_EVAL_TOKEN').catch((error) => error)
    await vi.advanceTimersByTimeAsync(240000)
    expect((await pending).message).toMatch(/healthy|wake/i)
    expect(paths.length).toBeGreaterThan(1)
    expect(paths.every((path) => path === '/health')).toBe(true)
    expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
    expect(existsSync(`${path}.refresh-failed`)).toBe(false)
    healthy = true
    await refreshCredential('ORBIT_EVAL_TOKEN')
    expect(process.env.ORBIT_EVAL_TOKEN).toBe('fresh-access')
    expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('rotated-refresh')
  } finally { vi.useRealTimers() }
})


it.each(['before submission', 'during submission'])('joins concurrent refreshes for one account %s', async (phase) => {
  const path = credentials()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let entered
  const started = new Promise((resolve) => { entered = resolve })
  const request = vi.fn(async (url) => {
    if (new URL(url).pathname === '/health') {
      if (phase === 'before submission') { entered(); await gate }
      return Response.json({ status: 'Healthy', commit: null, checks: [] })
    }
    if (phase === 'during submission') { entered(); await gate }
    return Response.json({ token: 'fresh-access', refreshToken: 'rotated-refresh' })
  })
  vi.stubGlobal('fetch', request)
  const first = refreshCredential('ORBIT_EVAL_TOKEN')
  await started
  expect(existsSync(`${path}.refresh-failed`)).toBe(phase === 'during submission')
  const both = Promise.allSettled([first, refreshCredential('ORBIT_EVAL_TOKEN')])
  release()
  expect(await both).toEqual([{ status: 'fulfilled', value: undefined }, { status: 'fulfilled', value: undefined }])
  expect(request.mock.calls.filter(([url]) => new URL(url).pathname === '/api/auth/refresh')).toHaveLength(1)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('fresh-access')
  expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('rotated-refresh')
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
})

it('shares a rejected refresh and blocks later callers and other accounts with its marker', async () => {
  const path = credentials()
  let release
  let entered
  const gate = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { entered = resolve })
  const request = vi.fn(async () => {
    entered()
    await gate
    return new Response(null, { status: 401 })
  })
  vi.stubGlobal('fetch', (url, options) => new URL(url).pathname === '/health'
    ? Promise.resolve(Response.json({ status: 'Healthy', commit: null, checks: [] })) : request(url, options))
  const first = refreshCredential('ORBIT_EVAL_TOKEN')
  await started
  const both = Promise.allSettled([first, refreshCredential('ORBIT_EVAL_TOKEN')])
  release()
  for (const outcome of await both) {
    expect(outcome.status).toBe('rejected')
    expect(outcome.reason.message).toContain('Refresh rejected with HTTP 401.')
  }
  expect(existsSync(`${path}.refresh-failed`)).toBe(true)
  for (const key of ['ORBIT_EVAL_TOKEN', 'ORBIT_EVAL_FREE_TOKEN']) {
    await expect(refreshCredential(key)).rejects.toThrow('A refresh already failed')
    expect(process.env[key]).toBeUndefined()
  }
  expect(request).toHaveBeenCalledTimes(1)
})

it('blocks an interrupted submission without making another request', async () => {
  const path = credentials()
  writeFileSync(`${path}.refresh-failed`, '', { mode: 0o600 })
  const request = vi.fn()
  vi.stubGlobal('fetch', request)
  await expect(refreshCredential('ORBIT_EVAL_TOKEN')).rejects.toThrow('A refresh already failed')
  expect(request).not.toHaveBeenCalled()
  expect(existsSync(`${path}.refresh-failed`)).toBe(true)
})

it.each([502, 503, 504, 'network', 'body-network'])('recovers a single transient refresh %s before continuing the attempt', async (failure) => {
  const path = credentials()
  vi.useFakeTimers()
  const submissions = []
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    submissions.push({ at: Date.now(), token: JSON.parse(options.body).refreshToken, signal: options.signal })
    if (submissions.length === 1) {
      if (failure === 'network') throw new TypeError('SECRET_REFRESH_TOKEN')
      if (failure === 'body-network') return new Response(new ReadableStream({
        start(controller) { controller.error(new TypeError('SECRET_REFRESH_TOKEN')) },
      }))
      return new Response(null, { status: failure })
    }
    return Response.json({ token: 'recovered-access', refreshToken: 'recovered-refresh' })
  })
  const pending = beforeEach(attempt())
  await vi.advanceTimersByTimeAsync(750)
  expect((await pending).test.vars).not.toHaveProperty('preconditionFailure')
  expect(submissions).toHaveLength(2)
  expect(submissions[1].at - submissions[0].at).toBe(250)
  expect(submissions.map(({ token }) => token)).toEqual(['old-refresh', 'old-refresh'])
  expect(submissions[0].signal).not.toBe(submissions[1].signal)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('recovered-access')
  expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('recovered-refresh')
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
})

it.each([502, 503, 504, 'network', 'body-network'])('bounds repeated transient refresh %s to one case and lets the next case recover', async (failure) => {
  const path = credentials()
  vi.useFakeTimers()
  const submissions = []
  let recovering = false
  vi.stubGlobal('fetch', async (url) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    submissions.push(Date.now())
    if (recovering) return Response.json({ token: 'recovered-access', refreshToken: 'recovered-refresh' })
    if (failure === 'network') throw new TypeError('SECRET_REFRESH_TOKEN')
    if (failure === 'body-network') return new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError('SECRET_REFRESH_TOKEN')) },
    }))
    return new Response(null, { status: failure })
  })
  const pending = beforeEach(attempt())
  await vi.advanceTimersByTimeAsync(750)
  const failed = (await pending).test
  expect(failed.vars.preconditionFailure).toContain('after 3 attempts')
  expect(failed.vars.preconditionFailure).not.toContain('SECRET')
  expect(submissions.map((instant) => instant - submissions[0])).toEqual([0, 250, 750])
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
  expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('old-refresh')
  expect(existsSync(`${path}.refresh-failed`)).toBe(false)
  expect(existsSync(`${path}.lock`)).toBe(false)
  expect(existsSync(`${path}.rotated`)).toBe(false)
  recovering = true
  const next = (await beforeEach(attempt())).test
  expect(next.vars).not.toHaveProperty('preconditionFailure')
  expect(failed.vars.preconditionFailure).toContain('after 3 attempts')
  expect(submissions).toHaveLength(4)
  expect(process.env.ORBIT_EVAL_TOKEN).toBe('recovered-access')
  expect(JSON.parse(readFileSync(path, 'utf8')).ORBIT_EVAL_TOKEN.refreshToken).toBe('recovered-refresh')
})

it.each([400, 401])('keeps HTTP %s fatal without retrying or letting a later case submit', async (status) => {
  const path = credentials()
  const request = vi.fn(async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : new Response(null, { status }))
  vi.stubGlobal('fetch', request)
  expect((await beforeEach(attempt())).test.vars.preconditionFailure).toContain(`HTTP ${status}`)
  const submitted = request.mock.calls.length
  expect(existsSync(`${path}.refresh-failed`)).toBe(true)
  expect((await beforeEach(attempt())).test.vars.preconditionFailure).toContain('A refresh already failed')
  expect(request).toHaveBeenCalledTimes(submitted)
  expect(process.env.ORBIT_EVAL_TOKEN).toBeUndefined()
})
