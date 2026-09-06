import { describe, expect, it } from 'vitest'
import { getErrorSurface, getRetryCountdown } from '../utils/error-surface'
import { createThrottleStoreState, type ThrottleStoreState } from '../stores/throttle-store'

const rejection = { status: 429, data: { error: 'Too many requests', requestId: 'request-reference', limit: 10, count: 11, retryAfterUtc: '2026-09-06T00:00:42.000Z' } }

describe('error surface', () => {
  it('uses the absolute deadline and real reference from a rejected request', () => {
    expect(getErrorSurface(rejection)).toEqual({ requestId: 'request-reference', retryAt: Date.parse(rejection.data.retryAfterUtc) })
    expect(getRetryCountdown(Date.parse(rejection.data.retryAfterUtc), Date.parse('2026-09-06T00:00:00.000Z'))).toEqual({ seconds: 42, label: '0:42' })
  })
  it.each([null, {}, { status: 429 }, { status: 500, data: rejection.data }, { status: 429, data: { retryAfterUtc: 'invalid' } }, { status: 429, data: { retryAfterUtc: '123' } }])('does not fabricate a countdown for %j', (error) => {
    expect(getErrorSurface(error).retryAt).toBeNull()
  })
  it('recomputes after backgrounding, rounds up, and stops at zero', () => {
    expect(getRetryCountdown(62000, 0).label).toBe('1:02')
    expect(getRetryCountdown(62000, 61999).seconds).toBe(1)
    expect(getRetryCountdown(62000, 90000)).toEqual({ seconds: 0, label: '0:00' })
  })
  it('only opens for a timed throttle and can return to the original screen', () => {
    let state: ThrottleStoreState = createThrottleStoreState((next) => { state = { ...state, ...next } })
    expect(state.show(new Error('failure'))).toBe(false)
    expect(state.error).toBeNull()
    expect(state.show(rejection)).toBe(true)
    expect(state.error).toBe(rejection)
    state.clear()
    expect(state.error).toBeNull()
  })
})
