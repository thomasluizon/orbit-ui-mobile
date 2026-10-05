import { describe, expect, it } from 'vitest'
import { shouldRetryQuery } from '../query/retry'
import { createApiClientError } from '../utils/error-utils'

describe('shouldRetryQuery', () => {
  it.each([
    createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized'),
    createApiClientError(403, { error: 'Pro access required', errorCode: 'PAY_GATE' }, 'Forbidden'),
    createApiClientError(429, { error: 'Too many requests' }, 'Too many requests'),
  ])('never retries a final response with status $status', (error) => {
    for (const failureCount of [0, 1, 2, 3]) {
      expect(shouldRetryQuery(failureCount, error)).toBe(false)
    }
  })

  it.each([
    new Error('Network unavailable'),
    new Error('Request reference 401'),
    createApiClientError(500, { error: 'Request reference 401' }, 'Server error'),
    createApiClientError(403, { error: 'Forbidden', errorCode: 'FORBIDDEN' }, 'Forbidden'),
    createApiClientError(500, { errorCode: 'PAY_GATE' }, 'Server error'),
    undefined,
  ])('keeps three retries for other errors: %s', (error) => {
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(true)
    expect(shouldRetryQuery(2, error)).toBe(true)
    expect(shouldRetryQuery(3, error)).toBe(false)
    expect(shouldRetryQuery(4, error)).toBe(false)
  })
})
