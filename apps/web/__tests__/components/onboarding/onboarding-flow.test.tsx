import { describe, expect, it } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'

describe('OnboardingFlow state model', () => {
  it('keeps one counter across three decisions and the done state', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingNextStep(ONBOARDING_REMIND_STEP)).toBe(ONBOARDING_DONE_STEP)
    expect(shouldHideOnboardingFooter(ONBOARDING_REMIND_STEP)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_DONE_STEP)).toBe(true)
  })
})
