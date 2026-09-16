import { describe, expect, it } from 'vitest'
import {
  canSnapshotOnboardingEntry,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingHabitFrequencyLabelKey,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_HABIT_FREQUENCIES,
  ONBOARDING_HABIT_SUGGESTIONS,
  ONBOARDING_WEEK_START_OPTIONS,
  resolveRetainedOnboarding,
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
    expect(ONBOARDING_WEEK_START_OPTIONS.map((option) => option.value)).toEqual([1, 0])
  })

  it('derives onboarding progress consistently', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingNextStep(1)).toBe(2)
    expect(getOnboardingPreviousStep(2)).toBe(1)
    expect(shouldHideOnboardingFooter(1)).toBe(true)
    expect(shouldHideOnboardingFooter(5)).toBe(false)
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

describe('canSnapshotOnboardingEntry', () => {
  it('is true once not-completed, unsuppressed, and the habit count has settled', () => {
    expect(
      canSnapshotOnboardingEntry({
        hasCompletedOnboarding: false,
        suppressed: false,
        habitCountLoaded: true,
      }),
    ).toBe(true)
  })

  it('waits while the habit count is still loading', () => {
    expect(
      canSnapshotOnboardingEntry({
        hasCompletedOnboarding: false,
        suppressed: false,
        habitCountLoaded: false,
      }),
    ).toBe(false)
  })

  it('waits while suppressed (draft hydrating or answers flushing)', () => {
    expect(
      canSnapshotOnboardingEntry({
        hasCompletedOnboarding: false,
        suppressed: true,
        habitCountLoaded: true,
      }),
    ).toBe(false)
  })

  it('never snapshots once onboarding is already complete', () => {
    expect(
      canSnapshotOnboardingEntry({
        hasCompletedOnboarding: true,
        suppressed: false,
        habitCountLoaded: true,
      }),
    ).toBe(false)
  })

  it('never snapshots before the profile has loaded', () => {
    expect(
      canSnapshotOnboardingEntry({
        hasCompletedOnboarding: undefined,
        suppressed: false,
        habitCountLoaded: true,
      }),
    ).toBe(false)
  })
})

describe('resolveRetainedOnboarding', () => {
  it('shows the overlay for a not-completed account that had no habits at entry', () => {
    expect(
      resolveRetainedOnboarding({
        hasCompletedOnboarding: false,
        hadHabitsAtEntry: false,
      }),
    ).toBe('show')
  })

  it('auto-completes for a not-completed account that already had habits at entry', () => {
    expect(
      resolveRetainedOnboarding({
        hasCompletedOnboarding: false,
        hadHabitsAtEntry: true,
      }),
    ).toBe('autocomplete')
  })

  it('does nothing until the entry snapshot has been captured', () => {
    expect(
      resolveRetainedOnboarding({
        hasCompletedOnboarding: false,
        hadHabitsAtEntry: null,
      }),
    ).toBe('none')
  })

  it('does nothing once onboarding is complete, regardless of the snapshot', () => {
    expect(
      resolveRetainedOnboarding({
        hasCompletedOnboarding: true,
        hadHabitsAtEntry: true,
      }),
    ).toBe('none')
  })

  it('does nothing before the profile has loaded', () => {
    expect(
      resolveRetainedOnboarding({
        hasCompletedOnboarding: undefined,
        hadHabitsAtEntry: null,
      }),
    ).toBe('none')
  })
})
