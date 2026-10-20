import { describe, expect, it, vi } from 'vitest'
import { shouldRetryQuery, queryRetryDelay, parseRetryAfter } from '../query/retry'
import { createApiClientError } from '../utils/error-utils'

describe('shouldRetryQuery', () => {
  it.each([
    createApiClientError(401, { error: 'Unauthorized' }, 'Unauthorized'),
    createApiClientError(403, { error: 'Pro access required', errorCode: 'PAY_GATE' }, 'Forbidden'),
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

describe('rate limited reads', () => {
  it('gives upstream starting the same bounded recovery window as rate limits', () => {
    const error = createApiClientError(503, { errorCode: 'UPSTREAM_STARTING' }, 'Unavailable', '5')
    let total = 0
    for (let attempt = 0; shouldRetryQuery(attempt, error); attempt++) {
      total += queryRetryDelay(attempt, error)
      expect(attempt).toBeLessThan(10)
    }
    expect(total).toBeGreaterThanOrEqual(90_000)
    expect(total).toBeLessThanOrEqual(720_000)
    expect(shouldRetryQuery(6, error)).toBe(false)
  })
  it('retries long enough for a sleeping service with a bounded wait', () => {
    const error = createApiClientError(429, null, 'Unavailable')
    let total = 0
    let previous = 0
    for (let attempt = 0; shouldRetryQuery(attempt, error); attempt++) {
      const delay = queryRetryDelay(attempt, error)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
      total += delay
      expect(attempt).toBeLessThan(10)
    }
    expect(total).toBeGreaterThanOrEqual(90_000)
    expect(total).toBeLessThanOrEqual(720_000)
  })

  it.each(['0', '1'])('keeps the recovery window with a short Retry-After %s', (retryAfter) => {
    const error = createApiClientError(429, null, 'Unavailable', retryAfter)
    let total = 0
    for (let count = 0; shouldRetryQuery(count, error); count++) {
      total += queryRetryDelay(count, error)
      expect(count).toBeLessThan(10)
    }
    expect(total).toBeGreaterThanOrEqual(90_000)
    expect(total).toBeLessThanOrEqual(720_000)
  })

  it.each(['60', 'Thu, 01 Jan 1970 00:01:00 GMT'])('honours Retry-After %s', (retryAfter) => {
    const error = Object.assign(createApiClientError(429, null, 'Unavailable'), { retryAfter })
    vi.spyOn(Date, 'now').mockReturnValue(0)
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(queryRetryDelay(0, error)).toBe(60_000)
    vi.restoreAllMocks()
  })

  it('bounds repeated header delays and refuses a deadline beyond the bound', () => {
    const error = Object.assign(createApiClientError(429, null, 'Unavailable'), { retryAfter: '120' })
    let total = 0
    for (let count = 0; shouldRetryQuery(count, error); count++) {
      total += queryRetryDelay(count, error)
      expect(count).toBeLessThan(10)
    }
    expect(total).toBe(720_000)
    error.retryAfter = '721'
    expect(shouldRetryQuery(0, error)).toBe(false)
  })

  it.each([null, '', '-1', 'garbage'])('uses backoff for invalid header %s', (header) => {
    expect(parseRetryAfter(header)).toBeNull()
  })
})
