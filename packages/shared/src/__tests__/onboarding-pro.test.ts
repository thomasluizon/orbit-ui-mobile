import { describe, expect, it } from 'vitest'
import { createMockProfile } from './factories'
import { getCurrentPlan, getTrialDaysLeft, resolveOnboardingPlan, ONBOARDING_PRO_STEP, getOnboardingDisplayTotal } from '../utils'

const now = new Date('2026-09-12T12:00:00Z')
describe('Onboarding Pro plan resolution', () => {
  it('keeps three numbered decisions', () => { expect(getOnboardingDisplayTotal()).toBe(3); expect(ONBOARDING_PRO_STEP).toBeGreaterThan(3) })
  it.each([undefined, null])('does not branch without a profile', (profile) => expect(resolveOnboardingPlan(profile)).toBeNull())
  it('separates trial from the pro plan flag', () => {
    const profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2026-09-19T12:00:00Z' })
    expect(resolveOnboardingPlan(profile, false, now)).toBe('Trial'); expect(getTrialDaysLeft(profile, now)).toBe(7)
  })
  it.each([false, true])('accepts paid or lifetime Pro, lifetime=%s', (isLifetimePro) => {
    expect(getCurrentPlan(createMockProfile({ hasProAccess: !isLifetimePro, isLifetimePro, isTrialActive: false }))).toBe('Pro')
  })
  it('resolves an expired reset account from refreshed server flags', () => expect(resolveOnboardingPlan(createMockProfile({ hasCompletedOnboarding: false, isTrialActive: false, hasProAccess: false, plan: 'free', trialEndsAt: '2026-09-11T12:00:00Z' }), false, now)).toBe('Free'))
  it('never reoffers a stale trial after a failed refetch', () => expect(resolveOnboardingPlan(createMockProfile({ isTrialActive: true, hasProAccess: true, trialEndsAt: '2026-09-11T12:00:00Z' }), true, now)).toBe('Free'))
})
