import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_COMPLETE_STEP,
  getOnboardingHabitFrequencyLabelKey,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
} from '../utils/onboarding'

describe('onboarding step boundaries', () => {
  it('clamps the next step at the completion step', () => {
    expect(getOnboardingNextStep(ONBOARDING_COMPLETE_STEP)).toBe(
      ONBOARDING_COMPLETE_STEP,
    )
    expect(getOnboardingNextStep(ONBOARDING_COMPLETE_STEP + 1)).toBe(
      ONBOARDING_COMPLETE_STEP,
    )
  })

  it('clamps the previous step at zero', () => {
    expect(getOnboardingPreviousStep(0)).toBe(0)
    expect(getOnboardingPreviousStep(-1)).toBe(0)
  })

  it('labels monthly and yearly frequencies with the one-time fallback key', () => {
    expect(getOnboardingHabitFrequencyLabelKey('Month')).toBe(
      'onboarding.flow.createHabit.frequency.oneTime',
    )
    expect(getOnboardingHabitFrequencyLabelKey('Year')).toBe(
      'onboarding.flow.createHabit.frequency.oneTime',
    )
  })
})
