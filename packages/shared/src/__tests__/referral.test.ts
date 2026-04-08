import { describe, expect, it } from 'vitest'
import { buildReferralUrl } from '../utils/referral'

describe('buildReferralUrl', () => {
  it('builds the hosted referral url for a code', () => {
    expect(buildReferralUrl('XYZ789')).toBe('https://app.useorbit.org/r/XYZ789')
  })

  it('returns an empty string when the code is missing', () => {
    expect(buildReferralUrl(null)).toBe('')
    expect(buildReferralUrl(undefined)).toBe('')
  })
})
