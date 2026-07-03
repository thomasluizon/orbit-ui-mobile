import { describe, it, expect } from 'vitest'
import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { ApiClientError } from '@orbit/shared'
import {
  beforeSendEvent,
  isExpectedApiClientError,
  scrubEvent,
} from '@/lib/sentry-scrub'

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

describe('isExpectedApiClientError', () => {
  it.each([502, 503, 504, 520, 521, 522, 523, 524])(
    'treats transient gateway status %i as expected',
    (status) => {
      expect(isExpectedApiClientError(new ApiClientError(status, 'gateway'))).toBe(true)
    },
  )

  it('treats the AI-unavailable code as expected', () => {
    const error = new ApiClientError(503, 'AI service temporarily unavailable', {
      code: 'AI_UNAVAILABLE',
    })
    expect(isExpectedApiClientError(error)).toBe(true)
  })

  it('treats the optimistic-concurrency conflict code as expected', () => {
    const error = new ApiClientError(409, 'changed at the same time', {
      code: 'CONCURRENT_UPDATE_CONFLICT',
    })
    expect(isExpectedApiClientError(error)).toBe(true)
  })

  it('does not treat a genuine 500 as expected', () => {
    expect(isExpectedApiClientError(new ApiClientError(500, 'boom'))).toBe(false)
  })

  it('does not treat a validation 400 as expected', () => {
    const error = new ApiClientError(400, 'bad', { code: 'VALIDATION_ERROR' })
    expect(isExpectedApiClientError(error)).toBe(false)
  })

  it('ignores non-ApiClientError values', () => {
    expect(isExpectedApiClientError(new Error('Failed with status 520'))).toBe(false)
    expect(isExpectedApiClientError(undefined)).toBe(false)
  })
})

describe('beforeSendEvent', () => {
  function makeHint(originalException: unknown): EventHint {
    return { originalException }
  }

  it('drops expected ApiClientErrors', () => {
    const hint = makeHint(new ApiClientError(520, 'Failed with status 520'))
    expect(beforeSendEvent(makeEvent(), hint)).toBeNull()
  })

  it('scrubs and forwards unexpected errors', () => {
    const hint = makeHint(new ApiClientError(500, 'boom'))
    const result = beforeSendEvent(makeEvent(), hint)
    expect(result).not.toBeNull()
    expect(result?.user?.email).toBeUndefined()
  })

  it('forwards non-ApiClientError events after scrubbing', () => {
    const hint = makeHint(new Error('unexpected'))
    const result = beforeSendEvent(makeEvent(), hint)
    expect(result).not.toBeNull()
    expect(result?.request?.data).toBeUndefined()
  })
})
