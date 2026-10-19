import { describe, expect, it } from 'vitest'
import { isMissingBillingError, isMissingBillingStatus } from '../utils/billing'
import { createApiClientError } from '../utils/error-utils'

describe('isMissingBillingStatus', () => {
  it('classifies exactly 404 as missing billing', () => {
    expect(isMissingBillingStatus(404)).toBe(true)
  })

  it('does not classify other 4xx client errors as missing billing', () => {
    expect(isMissingBillingStatus(400)).toBe(false)
    expect(isMissingBillingStatus(401)).toBe(false)
    expect(isMissingBillingStatus(403)).toBe(false)
    expect(isMissingBillingStatus(429)).toBe(false)
  })

  it('does not classify success or server-error statuses as missing billing', () => {
    expect(isMissingBillingStatus(200)).toBe(false)
    expect(isMissingBillingStatus(500)).toBe(false)
    expect(isMissingBillingStatus(503)).toBe(false)
  })

  it('requires an exact match rather than a numeric prefix or range', () => {
    expect(isMissingBillingStatus(4040)).toBe(false)
    expect(isMissingBillingStatus(40)).toBe(false)
  })
})

describe('isMissingBillingError', () => {
  it('detects a structured 404 when the backend message contains no status', () => {
    const error = createApiClientError(
      404,
      { error: 'This account has no active subscription.' },
      'Request failed: 404',
    )

    expect(error.message).toBe('This account has no active subscription.')
    expect(isMissingBillingError(error)).toBe(true)
  })

  it.each(['Not found', '', 'Different backend wording'])('detects a structured 404 with message %j', (message) => {
    expect(isMissingBillingError(createApiClientError(404, { error: message }, 'Request failed'))).toBe(true)
  })

  it('rejects plain errors even when their message contains 404', () => {
    expect(isMissingBillingError(new Error('Request failed with status 404'))).toBe(false)
    expect(isMissingBillingError(new TypeError('status 404'))).toBe(false)
  })

  it.each([400, 401, 403, 429, 500, 503, 4040, 40])('rejects status %i even when the message contains 404', (status) => {
    const error = createApiClientError(status, { error: 'Upstream error 404' }, 'Request failed')
    expect(isMissingBillingError(error)).toBe(false)
  })

  it('rejects non-Error values even when they carry a 404 message', () => {
    expect(isMissingBillingError('Request failed with status 404')).toBe(false)
    expect(isMissingBillingError({ message: 'Request failed with status 404' })).toBe(false)
    expect(isMissingBillingError(404)).toBe(false)
    expect(isMissingBillingError(null)).toBe(false)
    expect(isMissingBillingError(undefined)).toBe(false)
  })
})
