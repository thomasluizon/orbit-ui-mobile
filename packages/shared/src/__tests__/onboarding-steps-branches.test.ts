import { describe, expect, it } from 'vitest'
import {
  getOnboardingHabitFrequencyLabelKey,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
} from '../utils/onboarding'

describe('onboarding step boundaries', () => {
  it('clamps the next step at the completion step', () => {
    expect(getOnboardingNextStep(6, true)).toBe(6)
    expect(getOnboardingNextStep(9, false)).toBe(6)
  })

  it('clamps the previous step at zero and skips the goal step for free users going back', () => {
    expect(getOnboardingPreviousStep(0, true)).toBe(0)
    expect(getOnboardingPreviousStep(-2, false)).toBe(0)
    expect(getOnboardingPreviousStep(5, false)).toBe(3)
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
