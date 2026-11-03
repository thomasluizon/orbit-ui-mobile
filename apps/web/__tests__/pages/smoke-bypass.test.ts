import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import { authenticate } from '@/e2e/support/auth'

type RouteMatch = Parameters<Page['route']>[0]
type RouteHandler = Parameters<Page['route']>[1]

const smokeOrigin = 'https://staging.example.test'
const secret = 'test-smoke-bypass'
const navigationBoundary = new Error('Authentication routes installed before navigation')

async function authenticationRoutes() {
  const registrations: { match: RouteMatch; handler: RouteHandler }[] = []
  const page = {
    route: async (match: RouteMatch, handler: RouteHandler) => { registrations.push({ match, handler }) },
    goto: async () => { throw navigationBoundary },
  } as unknown as Page
  await expect(authenticate(page)).rejects.toBe(navigationBoundary)
  return registrations.filter(({ match }) => typeof match === 'function')
}

beforeEach(() => {
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
