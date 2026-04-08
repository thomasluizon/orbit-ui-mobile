import { describe, expect, it } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingHabitFrequencyLabelKey,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_GOAL_SUGGESTIONS,
  ONBOARDING_HABIT_FREQUENCIES,
  ONBOARDING_HABIT_SUGGESTIONS,
  ONBOARDING_WEEK_START_OPTIONS,
  shouldHideOnboardingFooter,
} from '../utils/onboarding'

describe('onboarding helpers', () => {
  it('exposes the canonical suggestions and options', () => {
    expect(ONBOARDING_HABIT_SUGGESTIONS.map((suggestion) => suggestion.key)).toEqual([
      'water',
      'read',
      'exercise',
      'meditate',
    ])
    expect(ONBOARDING_HABIT_FREQUENCIES.map((frequency) => frequency.value)).toEqual([
      'Day',
      'Week',
      'one-time',
    ])
    expect(ONBOARDING_GOAL_SUGGESTIONS.map((suggestion) => suggestion.key)).toEqual([
      'run',
      'books',
      'save',
    ])
    expect(ONBOARDING_WEEK_START_OPTIONS.map((option) => option.value)).toEqual([1, 0])
  })

  it('derives onboarding progress consistently', () => {
    expect(getOnboardingDisplayTotal(true)).toBe(6)
    expect(getOnboardingDisplayTotal(false)).toBe(5)
    expect(getOnboardingDisplayStep(0, true)).toBe(1)
    expect(getOnboardingDisplayStep(4, false)).toBe(4)
    expect(getOnboardingNextStep(2, true)).toBe(3)
    expect(getOnboardingNextStep(2, false)).toBe(4)
    expect(getOnboardingPreviousStep(4, false)).toBe(2)
    expect(shouldHideOnboardingFooter(1)).toBe(true)
    expect(shouldHideOnboardingFooter(0)).toBe(false)
  })

  it('maps habit frequency labels', () => {
    expect(getOnboardingHabitFrequencyLabelKey('Day')).toBe(
      'onboarding.flow.createHabit.frequency.daily',
    )
    expect(getOnboardingHabitFrequencyLabelKey('Week')).toBe(
      'onboarding.flow.createHabit.frequency.weekly',
    )
    expect(getOnboardingHabitFrequencyLabelKey(undefined)).toBe(
      'onboarding.flow.createHabit.frequency.oneTime',
    )
  })
})
