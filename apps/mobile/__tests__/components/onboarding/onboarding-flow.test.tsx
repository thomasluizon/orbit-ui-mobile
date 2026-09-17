import { describe, expect, it } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'

describe('OnboardingFlow state model', () => {
  it('shows three decisions and a separate done state', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingNextStep(ONBOARDING_REMIND_STEP)).toBe(ONBOARDING_DONE_STEP)
    expect(getOnboardingPreviousStep(ONBOARDING_DONE_STEP)).toBe(ONBOARDING_REMIND_STEP)
    expect(shouldHideOnboardingFooter(1)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_DONE_STEP)).toBe(true)
  })
})
