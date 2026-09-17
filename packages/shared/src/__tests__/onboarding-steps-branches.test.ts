import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_DONE_STEP,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
} from '../utils/onboarding'

describe('onboarding step boundaries', () => {
  it('clamps the next step at the completion step', () => {
    expect(getOnboardingNextStep(ONBOARDING_DONE_STEP)).toBe(
      ONBOARDING_DONE_STEP,
    )
    expect(getOnboardingNextStep(ONBOARDING_DONE_STEP + 1)).toBe(
      ONBOARDING_DONE_STEP,
    )
  })

  it('clamps the previous step at zero', () => {
    expect(getOnboardingPreviousStep(0)).toBe(0)
    expect(getOnboardingPreviousStep(-1)).toBe(0)
  })

})
