import { describe, it, expect, vi } from 'vitest'
import type { ErrorEvent } from '@sentry/react-native'

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  wrap: (component: unknown) => component,
  captureException: vi.fn(),
}))

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
