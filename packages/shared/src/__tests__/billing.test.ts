import { describe, expect, it } from 'vitest'
import { isMissingBillingError, isMissingBillingStatus } from '../utils/billing'

describe('billing utils', () => {
  it('treats 404 as missing billing', () => {
    expect(isMissingBillingStatus(404)).toBe(true)
    expect(isMissingBillingStatus(500)).toBe(false)
  })

  it('recognizes 404 errors from the mobile client path', () => {
    expect(isMissingBillingError(new Error('Request failed with status 404'))).toBe(true)
    expect(isMissingBillingError(new Error('Request failed with status 500'))).toBe(false)
  })
})
