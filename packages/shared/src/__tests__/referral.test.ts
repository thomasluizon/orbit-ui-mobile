import { describe, expect, it } from 'vitest'
import { buildRecapShareUrl, buildReferralUrl, isValidReferralCode, withShareLinkOrigin, selectReferralReward } from '../utils/referral'

describe('referral reward selection', () => {
  it.each([1, 7, 11])('uses the actual %i Pro days without borrowing the discount', (proDaysPerReferral) => {
    expect(selectReferralReward({ rewardType: 'pro_days', proDaysPerReferral, discountPercent: 23 }))
      .toEqual({ kind: 'proDays', values: { proDays: proDaysPerReferral } })
  })

  it('keeps the paid-account coupon and its own amount', () => {
    expect(selectReferralReward({ rewardType: 'discount', proDaysPerReferral: 11, discountPercent: 23 }))
      .toEqual({ kind: 'discount', values: { discountPercent: 23 } })
  })

  it.each([undefined, 0, -1, 1.5, NaN, Infinity])('withholds untrustworthy days %s', (proDaysPerReferral) => {
    expect(selectReferralReward({ rewardType: 'pro_days', proDaysPerReferral, discountPercent: 23 }))
      .toEqual({ kind: 'neutral', values: {} })
  })

  it.each([undefined, 0, -1, 1.5, 101, NaN, Infinity])('withholds untrustworthy percentage %s', (discountPercent) => {
    expect(selectReferralReward({ rewardType: 'discount', proDaysPerReferral: 11, discountPercent }))
      .toEqual({ kind: 'neutral', values: {} })
  })

  it.each([undefined, 'future_reward'])('requires a recognized kind %s even with both amounts', (rewardType) => {
    expect(selectReferralReward({ rewardType, proDaysPerReferral: 11, discountPercent: 23 }))
      .toEqual({ kind: 'neutral', values: {} })
  })

  it('keeps absent stats nonnumeric', () => {
    expect(selectReferralReward(null)).toEqual({ kind: 'neutral', values: {} })
    expect(selectReferralReward(undefined)).toEqual({ kind: 'neutral', values: {} })
  })
})

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

  it('builds a staging referral url from the selected origin', () => {
    expect(buildReferralUrl('XYZ789', 'https://app-staging.useorbit.org'))
      .toBe('https://app-staging.useorbit.org/r/XYZ789')
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

  it('builds a staging recap url from the selected origin', () => {
    expect(buildRecapShareUrl('XYZ789', 'week', 'https://app-staging.useorbit.org'))
      .toBe('https://app-staging.useorbit.org/r/XYZ789?recap=week')
  })

  it('returns an empty string when the code is missing', () => {
    expect(buildRecapShareUrl(null, 'week')).toBe('')
    expect(buildRecapShareUrl(undefined, 'month')).toBe('')
  })
})

describe('withShareLinkOrigin', () => {
  it('keeps a production recap link byte-identical', () => {
    const link = 'https://app.useorbit.org/r/XYZ789?recap=week'
    expect(withShareLinkOrigin(link, 'https://app.useorbit.org')).toBe(link)
  })

  it('uses the staging origin while preserving the recap path and query', () => {
    expect(withShareLinkOrigin(
      'https://app.useorbit.org/r/XYZ789?recap=week',
      'https://app-staging.useorbit.org',
    )).toBe('https://app-staging.useorbit.org/r/XYZ789?recap=week')
  })
})
