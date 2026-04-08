import { describe, expect, it } from 'vitest'
import {
  getCurrentPlan,
  getIsYearlyPro,
  getTrialDaysLeft,
  getTrialExpired,
  getTrialUrgent,
} from '../utils/profile-selectors'

describe('profile-selectors', () => {
  it('computes trial days left', () => {
    expect(
      getTrialDaysLeft({ trialEndsAt: '2025-01-10T00:00:00Z' }, new Date('2025-01-08T00:00:00Z')),
    ).toBe(2)
    expect(getTrialDaysLeft({ trialEndsAt: null }, new Date('2025-01-08T00:00:00Z'))).toBeNull()
  })

  it('computes the current plan label', () => {
    expect(getCurrentPlan(null)).toBe('Free')
    expect(getCurrentPlan({ hasProAccess: false, isTrialActive: true })).toBe('Trial')
    expect(getCurrentPlan({ hasProAccess: true, isTrialActive: false })).toBe('Pro')
  })

  it('detects expired trials', () => {
    expect(
      getTrialExpired({ trialEndsAt: '2025-01-01T00:00:00Z', isTrialActive: false, plan: 'free' }),
    ).toBe(true)
    expect(getTrialExpired({ trialEndsAt: null, isTrialActive: false, plan: 'free' })).toBe(false)
  })

  it('detects urgent trials', () => {
    expect(
      getTrialUrgent({ trialEndsAt: '2025-01-09T00:00:00Z' }, new Date('2025-01-08T00:00:00Z')),
    ).toBe(true)
    expect(
      getTrialUrgent({ trialEndsAt: '2025-01-15T00:00:00Z' }, new Date('2025-01-08T00:00:00Z')),
    ).toBe(false)
  })

  it('detects yearly or lifetime pro access', () => {
    expect(
      getIsYearlyPro({
        hasProAccess: true,
        isLifetimePro: false,
        subscriptionInterval: 'yearly',
      }),
    ).toBe(true)
    expect(
      getIsYearlyPro({
        hasProAccess: true,
        isLifetimePro: true,
        subscriptionInterval: null,
      }),
    ).toBe(true)
    expect(
      getIsYearlyPro({
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: 'yearly',
      }),
    ).toBe(false)
  })
})
