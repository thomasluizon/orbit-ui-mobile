import { describe, it, expect, vi } from 'vitest'
import type { ErrorEvent } from '@sentry/react-native'

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  wrap: (component: unknown) => component,
  captureException: vi.fn(),
}))

vi.unmock('@/lib/sentry')
const { scrubEvent } = await import('@/lib/sentry')

function makeEvent(): ErrorEvent {
  return {
    type: undefined,
    user: {
      id: 'opaque-guid',
      email: 'alice@example.com',
      username: 'alice',
      ip_address: '203.0.113.7',
    },
    breadcrumbs: [
      {
        category: 'console',
        message: 'token=eyJabc.def.ghi',
      },
      {
        category: 'http',
        data: {
          url: 'https://api.useorbit.org/api/auth/verify-code',
          method: 'POST',
          Authorization: 'Bearer eyJabc.def.ghi',
          request_body: '{"email":"bob@example.com","code":"123456"}',
          status_code: 500,
        },
      },
    ],
  }
}

describe('scrubEvent (mobile)', () => {
  it('removes user email, username, and ip but keeps opaque id', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.user?.email).toBeUndefined()
    expect(scrubbed.user?.username).toBeUndefined()
    expect(scrubbed.user?.ip_address).toBeUndefined()
    expect(scrubbed.user?.id).toBe('opaque-guid')
  })

  it('drops console breadcrumbs entirely', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.breadcrumbs?.some((b) => b.category === 'console')).toBe(false)
  })

  it('strips auth header and request body from http breadcrumbs but keeps method and status', () => {
    const scrubbed = scrubEvent(makeEvent())
    const http = scrubbed.breadcrumbs?.find((b) => b.category === 'http')
    expect(http?.data?.Authorization).toBeUndefined()
    expect(http?.data?.request_body).toBeUndefined()
    expect(http?.data?.method).toBe('POST')
    expect(http?.data?.status_code).toBe(500)
  })

  it('leaves no email or token anywhere in the serialized event', () => {
    const serialized = JSON.stringify(scrubEvent(makeEvent()))
    expect(serialized).not.toContain('alice@example.com')
    expect(serialized).not.toContain('bob@example.com')
    expect(serialized).not.toContain('eyJabc.def.ghi')
    expect(serialized).not.toContain('123456')
  })
})


it('removes incoming auth secrets from request URLs and navigation breadcrumbs', () => {
  const link = 'https://app.example.test/login?email=entry%40example.invalid&code=427169'
  const event = makeEvent()
  event.request = { url: link, query_string: 'email=entry%40example.invalid&code=427169' }
  event.breadcrumbs = [{ category: 'navigation', data: { from: link, to: '/login?email=entry%40example.invalid&code=427169' } }]
  const serialized = JSON.stringify(scrubEvent(event))
  expect(serialized.includes('427169')).toBe(false)
  expect(serialized.includes('entry%40example.invalid')).toBe(false)
  expect(serialized.includes('/login')).toBe(true)
})

it.each(['https://app-staging.useorbit.org/', 'orbit-staging://', '/'])('scrubs OAuth URLs throughout a callback failure event: %s', (prefix) => {
  const callback = `${prefix}auth-callback?code=private-code&state=private-state&handoff=private-handoff&error=private-error`
  const cleanup = 'https://app-staging.useorbit.org/api/auth/google/code?state=private-state'
  const result = scrubEvent({ type: undefined, message: 'auth_callback_failed', transaction: callback,
    request: { url: callback, headers: { Referer: callback } }, breadcrumbs: [
      { category: 'fetch', type: 'http', level: 'info', data: { method: 'DELETE', url: cleanup, status_code: 200 } },
      { category: 'navigation', data: { from: callback, to: '/login?state=private-state' } },
      { message: `Opening ${callback}` },
      { category: 'fetch', data: { url: '/api/calendar?mode=review', status_code: 200 } },
    ] })
  expect(JSON.stringify(result)).not.toContain('private-')
  expect(result.transaction).toBe(`${prefix}auth-callback`)
  expect(result.breadcrumbs?.[0]?.data).toEqual({ method: 'DELETE', url: 'https://app-staging.useorbit.org/api/auth/google/code', status_code: 200 })
  expect(result.breadcrumbs?.[3]?.data?.url).toBe('/api/calendar?mode=review')
})


it('scrubs event stream tickets from URLs and breadcrumb messages while retaining request context', () => {
  const url = 'https://api.useorbit.org/api/events?ticket=private.jwt.signature&cursor=next'
  const result = scrubEvent({ type: undefined, request: { url }, breadcrumbs: [
    { category: 'fetch', data: { url, method: 'GET', status_code: 503 } },
    { message: `Request failed: ${url}` },
    { category: 'navigation', data: { to: '/api/events?cursor=next&ticket=private.jwt.signature' } },
    { category: 'fetch', data: { url: '/api/events/ticket', method: 'POST' } },
  ] })
  expect(JSON.stringify(result)).not.toContain('private.jwt.signature')
  expect(result.breadcrumbs?.[0]?.data).toEqual({
    url: 'https://api.useorbit.org/api/events?ticket=[Filtered]&cursor=next', method: 'GET', status_code: 503,
  })
  expect(result.breadcrumbs?.[1]?.message).toContain('ticket=[Filtered]')
  expect(result.breadcrumbs?.[2]?.data?.to).toBe('/api/events?cursor=next&ticket=[Filtered]')
  expect(result.breadcrumbs?.[3]?.data?.url).toBe('/api/events/ticket')
})
