import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import { authenticate } from '@/e2e/support/auth'
import { installSmokeBypass } from '@/e2e/support/smoke-bypass'

const recording = vi.hoisted(() => ({ traceOptions: vi.fn(), active: false, har: new Map<string, unknown>() }))
vi.mock('@playwright/test', async (importOriginal) => ({
  ...await importOriginal<typeof import('@playwright/test')>(),
  test: { info: () => ({ _tracing: { traceOptions: recording.traceOptions } }) },
}))

function context() {
  return { tracing: { _isTracing: recording.active, _harRecorders: recording.har } }
}

type RouteMatch = Parameters<Page['route']>[0]
type RouteHandler = Parameters<Page['route']>[1]

const smokeOrigin = 'https://staging.example.test'
const secret = 'test-smoke-bypass'
const navigationBoundary = new Error('Authentication routes installed before navigation')

async function authenticationRoutes() {
  const registrations: { match: RouteMatch; handler: RouteHandler }[] = []
  const page = {
    context,
    route: async (match: RouteMatch, handler: RouteHandler) => { registrations.push({ match, handler }) },
    goto: async () => { throw navigationBoundary },
  } as unknown as Page
  await expect(authenticate(page)).rejects.toBe(navigationBoundary)
  return registrations.filter(({ match }) => typeof match === 'function')
}

beforeEach(() => {
  recording.traceOptions.mockReset()
  recording.active = false
  recording.har.clear()
  vi.stubEnv('SMOKE_BASE_URL', smokeOrigin)
  vi.stubEnv('SMOKE_BOT_BYPASS', secret)
})

afterEach(() => { vi.unstubAllEnvs() })

it.each(['/api/auth/send-code', '/api/auth/verify-code'])(
  'adds the bypass to same-origin %s and excludes unrelated requests', async (path) => {
    const registrations = await authenticationRoutes()
    expect(registrations).toHaveLength(1)
    const { match, handler } = registrations[0]!
    if (typeof match !== 'function') throw new Error('Expected a URL predicate')
    const headers = { 'content-type': 'application/json', 'x-orbit-request-id': 'test-request' }
    const continueRequest = vi.fn()
    for (const address of [
      `${smokeOrigin}${path}`, `${smokeOrigin}${path}?language=en`,
      `https://another.example.test${path}`, `http://staging.example.test${path}`,
      `https://staging.example.test:8443${path}`, `${smokeOrigin}/api/auth/google/code`,
      `${smokeOrigin}/api/auth/operations/send-code`, `${smokeOrigin}/api/habits`,
      `${smokeOrigin}${path}/extra`, `${smokeOrigin}${path}/`,
      `${smokeOrigin}/login?next=${path}`,
    ]) {
      continueRequest.mockClear()
      const url = new URL(address)
      if (match(url)) {
        const request = { headers: () => headers }
        const route = { request: () => request, continue: continueRequest } as unknown as Route
        await handler(route, route.request())
      }
      if (url.origin === smokeOrigin && url.pathname === path) {
        expect(continueRequest).toHaveBeenCalledExactlyOnceWith({
          headers: { ...headers, 'x-orbit-smoke-bypass': secret },
        })
      } else {
        expect(continueRequest).not.toHaveBeenCalled()
      }
    }
  },
)

it('installs the bypass only when the optional environment secret is nonempty', async () => {
  expect(await authenticationRoutes()).toHaveLength(1)
  for (const value of [undefined, '']) {
    vi.stubEnv('SMOKE_BOT_BYPASS', value)
    expect(await authenticationRoutes()).toHaveLength(0)
  }
})

it.each(['on', 'retain-on-failure', 'on-first-retry', 'on-all-retries', 'retain-on-first-failure', 'retain-on-failure-and-retries'])(
  'rejects the effective %s trace before registering a secret-bearing route', async (mode) => {
    recording.traceOptions.mockReturnValue({ mode })
    const route = vi.fn()
    await expect(installSmokeBypass({ route, context } as unknown as Page)).rejects.toThrow('Smoke bypass requires tracing and HAR recording to be off')
    expect(route).not.toHaveBeenCalled()
  },
)

it.each(['trace', 'HAR'])('rejects manual %s recording before installing the bypass', async (kind) => {
  if (kind === 'trace') recording.active = true
  else recording.har.set('recorder', {})
  const route = vi.fn()
  await expect(installSmokeBypass({ route, context } as unknown as Page)).rejects.toThrow('Smoke bypass requires tracing and HAR recording to be off')
  expect(route).not.toHaveBeenCalled()
})

it('checks recording again before sending a bypass request', async () => {
  const { handler } = (await authenticationRoutes())[0]!
  recording.active = true
  const continueRequest = vi.fn()
  const request = { headers: () => ({}) }
  const route = { request: () => request, continue: continueRequest } as unknown as Route
  await expect(handler(route, route.request())).rejects.toThrow('Smoke bypass requires tracing and HAR recording to be off')
  expect(continueRequest).not.toHaveBeenCalled()
})
