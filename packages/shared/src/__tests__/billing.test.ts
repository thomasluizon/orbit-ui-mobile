import { describe, expect, it } from 'vitest'
import { isMissingBillingError, isMissingBillingStatus } from '../utils/billing'

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
  it('detects a 404 in the error message the mobile client throws', () => {
    expect(isMissingBillingError(new Error('Request failed with status 404'))).toBe(true)
  })

  it('detects the 404 token regardless of surrounding text', () => {
    expect(isMissingBillingError(new Error('HTTP 404: Not Found'))).toBe(true)
  })

  it('detects 404 on Error subclasses', () => {
    expect(isMissingBillingError(new TypeError('status 404'))).toBe(true)
  })

  it('does not treat other status codes as missing billing', () => {
    expect(isMissingBillingError(new Error('Request failed with status 500'))).toBe(false)
    expect(isMissingBillingError(new Error('Request failed with status 403'))).toBe(false)
  })

  it('matches 404 only as a standalone token, not a digit substring', () => {
    expect(isMissingBillingError(new Error('Request failed with status 4040'))).toBe(false)
    expect(isMissingBillingError(new Error('error code 1404 occurred'))).toBe(false)
  })

  it('rejects non-Error values even when they carry a 404 message', () => {
    expect(isMissingBillingError('Request failed with status 404')).toBe(false)
    expect(isMissingBillingError({ message: 'Request failed with status 404' })).toBe(false)
    expect(isMissingBillingError(404)).toBe(false)
    expect(isMissingBillingError(null)).toBe(false)
    expect(isMissingBillingError(undefined)).toBe(false)
  })
})
