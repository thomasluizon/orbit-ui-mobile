import { describe, expect, it } from 'vitest'
import { buildRecapShareUrl, buildReferralUrl, isValidReferralCode } from '../utils/referral'

describe('isValidReferralCode', () => {
  it('accepts url-safe token shapes', () => {
    expect(isValidReferralCode('ABCD2345')).toBe(true)
    expect(isValidReferralCode('a_b-C9')).toBe(true)
  })

  it('rejects missing, empty, and unsafe values', () => {
    expect(isValidReferralCode(null)).toBe(false)
    expect(isValidReferralCode(undefined)).toBe(false)
    expect(isValidReferralCode('')).toBe(false)
    expect(isValidReferralCode('AB CD')).toBe(false)
    expect(isValidReferralCode('ab/../cd')).toBe(false)
  })
})

describe('buildReferralUrl', () => {
  it('builds the hosted referral url for a code', () => {
    expect(buildReferralUrl('XYZ789')).toBe('https://app.useorbit.org/r/XYZ789')
  })

  it('returns an empty string when the code is missing', () => {
    expect(buildReferralUrl(null)).toBe('')
    expect(buildReferralUrl(undefined)).toBe('')
  })
})

describe('buildRecapShareUrl', () => {
  it('embeds the referral code and recap period', () => {
    expect(buildRecapShareUrl('XYZ789', 'week')).toBe('https://app.useorbit.org/r/XYZ789?recap=week')
    expect(buildRecapShareUrl('XYZ789', 'year')).toBe('https://app.useorbit.org/r/XYZ789?recap=year')
  })

  it('returns an empty string when the code is missing', () => {
    expect(buildRecapShareUrl(null, 'week')).toBe('')
    expect(buildRecapShareUrl(undefined, 'month')).toBe('')
  })
})
