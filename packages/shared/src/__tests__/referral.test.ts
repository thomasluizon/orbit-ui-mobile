import { describe, expect, it } from 'vitest'
import { buildRecapShareUrl, buildReferralUrl } from '../utils/referral'

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
