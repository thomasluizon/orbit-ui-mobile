import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrub'

function makeEvent(): ErrorEvent {
  return {
    type: undefined,
    user: {
      id: 'opaque-guid',
      email: 'alice@example.com',
      username: 'alice',
      ip_address: '203.0.113.7',
    },
    request: {
      method: 'POST',
      url: 'https://app.useorbit.org/api/auth/verify-code',
      headers: {
        Authorization: 'Bearer eyJabc.def.ghi',
        Cookie: 'orbit_session=secret-token',
        'Content-Type': 'application/json',
      },
      cookies: { orbit_session: 'secret-token' },
      data: { email: 'bob@example.com', code: '123456' },
    },
  }
}

describe('scrubEvent', () => {
  it('removes user email, username, and ip but keeps opaque id', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.user?.email).toBeUndefined()
    expect(scrubbed.user?.username).toBeUndefined()
    expect(scrubbed.user?.ip_address).toBeUndefined()
    expect(scrubbed.user?.id).toBe('opaque-guid')
  })

  it('removes Authorization and Cookie headers but keeps Content-Type', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.request?.headers?.Authorization).toBeUndefined()
    expect(scrubbed.request?.headers?.Cookie).toBeUndefined()
    expect(scrubbed.request?.headers?.['Content-Type']).toBe('application/json')
  })

  it('drops request cookies and request body entirely', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.request?.cookies).toBeUndefined()
    expect(scrubbed.request?.data).toBeUndefined()
  })

  it('leaves no email or token anywhere in the serialized event', () => {
    const serialized = JSON.stringify(scrubEvent(makeEvent()))
    expect(serialized).not.toContain('alice@example.com')
    expect(serialized).not.toContain('bob@example.com')
    expect(serialized).not.toContain('eyJabc.def.ghi')
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('123456')
  })

  it('keeps non-PII request method and url', () => {
    const scrubbed = scrubEvent(makeEvent())
    expect(scrubbed.request?.method).toBe('POST')
    expect(scrubbed.request?.url).toContain('/api/auth/verify-code')
  })
})
