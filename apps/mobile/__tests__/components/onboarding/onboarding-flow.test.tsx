import { describe, expect, it } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'

describe('OnboardingFlow helpers', () => {
  it('keeps pro users on the full step sequence', () => {
    expect(getOnboardingDisplayTotal(true)).toBe(6)
    expect(getOnboardingDisplayStep(0, true)).toBe(1)
    expect(getOnboardingNextStep(2, true)).toBe(3)
    expect(getOnboardingPreviousStep(3, true)).toBe(2)
  })

  it('skips the goal creation step for free users', () => {
    expect(getOnboardingDisplayTotal(false)).toBe(5)
    expect(getOnboardingNextStep(2, false)).toBe(4)
    expect(getOnboardingDisplayStep(4, false)).toBe(4)
    expect(getOnboardingPreviousStep(4, false)).toBe(2)
  })

  it('hides the footer only on interactive onboarding steps', () => {
    expect(shouldHideOnboardingFooter(0)).toBe(false)
    expect(shouldHideOnboardingFooter(1)).toBe(true)
    expect(shouldHideOnboardingFooter(2)).toBe(true)
    expect(shouldHideOnboardingFooter(3)).toBe(true)
    expect(shouldHideOnboardingFooter(4)).toBe(false)
    expect(shouldHideOnboardingFooter(ONBOARDING_COMPLETE_STEP)).toBe(true)
  })
})
