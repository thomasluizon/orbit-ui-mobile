import { describe, expect, it } from 'vitest'
import type { Profile } from '@orbit/shared/types/profile'

import { resolveProfileSubscriptionDisplay } from '@/app/(tabs)/profile/_components/profile-subscription-display'

function translate(key: string, values?: Record<string, string | number>): string {
  if (key === 'profile.subscription.trialDaysLeft') {
    const days = values?.days ?? 0
    return `${days} day left | ${days} days left`
  }
  return key
}

function makeProfile(overrides: Partial<Profile>): Profile {
  return overrides as Profile
}

describe('resolveProfileSubscriptionDisplay', () => {
  it('renders the active-trial row with a soft trial badge and singular day copy', () => {
    const display = resolveProfileSubscriptionDisplay(
      makeProfile({ isTrialActive: true, hasProAccess: false }),
      false,
      1,
      translate,
    )

    expect(display.label).toBe('profile.subscription.trial')
    expect(display.hint).toBe('1 day left')
    expect(display.showBadge).toBe(true)
    expect(display.badgeTone).toBe('soft')
    expect(display.badgeLabel).toBe('trial.proBadge')
  })

  it('pluralizes the trial hint for multiple days remaining', () => {
    const display = resolveProfileSubscriptionDisplay(
      makeProfile({ isTrialActive: true }),
      false,
      5,
      translate,
    )

    expect(display.hint).toBe('5 days left')
  })

  it('defaults trial days to zero when the count is missing', () => {
    const display = resolveProfileSubscriptionDisplay(
      makeProfile({ isTrialActive: true }),
      false,
      null,
      translate,
    )

    expect(display.hint).toBe('0 days left')
  })

  it('renders the pro row with a violet pro badge', () => {
    const display = resolveProfileSubscriptionDisplay(
      makeProfile({ isTrialActive: false, hasProAccess: true }),
      false,
      null,
      translate,
    )

    expect(display.label).toBe('profile.subscription.pro')
    expect(display.hint).toBe('profile.subscription.proHint')
    expect(display.showBadge).toBe(true)
    expect(display.badgeTone).toBe('violet')
    expect(display.badgeLabel).toBe('common.proBadge')
  })

  it('renders the trial-ended row without a badge when the trial expired', () => {
    const display = resolveProfileSubscriptionDisplay(
      makeProfile({ isTrialActive: false, hasProAccess: false }),
      true,
      null,
      translate,
    )

    expect(display.label).toBe('profile.subscription.trialEnded')
    expect(display.hint).toBe('profile.subscription.trialEndedHint')
    expect(display.showBadge).toBe(false)
  })

  it('renders the free row for an undefined profile that has not expired', () => {
    const display = resolveProfileSubscriptionDisplay(
      undefined,
      false,
      null,
      translate,
    )

    expect(display.label).toBe('profile.subscription.free')
    expect(display.hint).toBe('profile.subscription.freeHint')
    expect(display.showBadge).toBe(false)
    expect(display.badgeTone).toBe('violet')
    expect(display.badgeLabel).toBe('common.proBadge')
  })
})
