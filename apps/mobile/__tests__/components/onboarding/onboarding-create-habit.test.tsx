import { describe, expect, it } from 'vitest'
import {
  getOnboardingHabitFrequencyLabelKey,
  ONBOARDING_HABIT_FREQUENCIES,
  ONBOARDING_HABIT_SUGGESTIONS,
} from '@orbit/shared/utils'

describe('OnboardingCreateHabit data', () => {
  it('exposes the expected habit suggestions', () => {
    expect(ONBOARDING_HABIT_SUGGESTIONS.map((suggestion) => suggestion.key)).toEqual([
      'water',
      'read',
      'exercise',
      'meditate',
    ])
  })

  it('maps onboarding frequencies to label keys', () => {
    expect(ONBOARDING_HABIT_FREQUENCIES.map((item) => item.value)).toEqual([
      'Day',
      'Week',
      'one-time',
    ])
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
