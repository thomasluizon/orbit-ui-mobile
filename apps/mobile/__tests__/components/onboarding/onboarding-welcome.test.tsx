import { describe, expect, it } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  ONBOARDING_WEEK_START_OPTIONS,
} from '@orbit/shared/utils'

describe('OnboardingWelcome helpers', () => {
  it('exposes both onboarding week-start options', () => {
    expect(ONBOARDING_WEEK_START_OPTIONS).toEqual([
      { value: 1, labelKey: 'settings.weekStartDay.monday' },
      { value: 0, labelKey: 'settings.weekStartDay.sunday' },
    ])
  })

  it('keeps the free-user display total one step shorter', () => {
    expect(getOnboardingDisplayTotal(true)).toBe(6)
    expect(getOnboardingDisplayTotal(false)).toBe(5)
  })

  it('compresses the display step after the skipped goal step for free users', () => {
    expect(getOnboardingDisplayStep(0, false)).toBe(1)
    expect(getOnboardingDisplayStep(4, false)).toBe(4)
    expect(getOnboardingDisplayStep(4, true)).toBe(5)
  })
})
