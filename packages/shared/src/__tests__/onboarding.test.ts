import { describe, expect, it } from 'vitest'
import {
  buildOnboardingHabitInput,
  canSnapshotOnboardingEntry,
  getOnboardingHabitTitle,
  getOnboardingReminderPreviewTime,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_STARTERS,
  ONBOARDING_STATE_AXIS,
  shouldRequestOnboardingSuggestion,
  resolveRetainedOnboarding,
  shouldHideOnboardingFooter,
} from '../utils/onboarding'

describe('onboarding helpers', () => {
  it('exposes the four sentence starters', () => {
    expect(ONBOARDING_STARTERS).toEqual(['water', 'walk', 'read', 'tidy'])
  })

  it('covers all fourteen canvas states', () => {
    expect(ONBOARDING_STATE_AXIS).toEqual([
      'what', 'what typed', 'what signed out', 'when', 'when corrected', 'at limit',
      'create failed', 'remind', 'remind already refused', 'remind enable failed',
      'remind no time', 'done', 'done no reminders', 'done signed out',
    ])
  })

  it('never spends an Astra message signed out or at the ceiling', () => {
    expect(shouldRequestOnboardingSuggestion({ isLive: false, atLimit: false })).toBe(false)
    expect(shouldRequestOnboardingSuggestion({ isLive: true, atLimit: true })).toBe(false)
    expect(shouldRequestOnboardingSuggestion({ isLive: true, atLimit: false })).toBe(true)
  })

  it('keeps three decisions while the done screen rests at 03 of 03', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingNextStep(ONBOARDING_REMIND_STEP)).toBe(ONBOARDING_DONE_STEP)
    expect(getOnboardingPreviousStep(ONBOARDING_DONE_STEP)).toBe(ONBOARDING_REMIND_STEP)
    expect(shouldHideOnboardingFooter(ONBOARDING_DONE_STEP)).toBe(true)
  })

  it('removes schedule words from the habit title', () => {
    expect(getOnboardingHabitTitle('Walk every Monday and Thursday at 18:00', 'en')).toBe('Walk')
    expect(getOnboardingHabitTitle('Caminhar toda segunda e quinta às 18:00', 'pt-BR')).toBe('Caminhar')
  })

  it.each([
    ['Read a book', 'en'],
    ['Work on posture', 'en'],
    ['Ler um livro', 'pt-BR'],
    ['Trabalhar na postura', 'pt-BR'],
  ] as const)('preserves an ordinary title byte for byte: %s', (sentence, locale) => {
    expect(getOnboardingHabitTitle(sentence, locale)).toBe(sentence)
  })

  it('removes only connectors orphaned by consumed schedule words', () => {
    expect(getOnboardingHabitTitle('Work on posture every Monday', 'en')).toBe('Work on posture')
    expect(getOnboardingHabitTitle('Trabalhar na postura toda segunda', 'pt-BR')).toBe('Trabalhar na postura')
  })

  it('builds the saved habit from the chosen schedule', () => {
    expect(buildOnboardingHabitInput({
      sentence: 'Walk every Monday and Thursday at 18:00',
      locale: 'en',
      emoji: '🚶',
      days: ['Monday', 'Thursday'],
      dueTime: '18:00',
    })).toMatchObject({
      title: 'Walk', emoji: '🚶', frequencyUnit: 'Day', frequencyQuantity: 1,
      days: ['Monday', 'Thursday'], dueTime: '18:00', reminderEnabled: true,
      reminderTimes: [15],
    })
  })

  it.each([
    {
      sentence: 'Read every day at 08:00',
      expected: {
        frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1,
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
    },
    {
      sentence: 'Walk 3 times a week',
      expected: { frequencyUnit: 'Week', frequencyQuantity: 3, intervalWeeks: 1, isFlexible: true },
    },
    {
      sentence: 'Clean every 2 weeks',
      expected: { frequencyUnit: 'Week', frequencyQuantity: 1, intervalWeeks: 2 },
    },
  ])('preserves the parsed cadence for $sentence', ({ sentence, expected }) => {
    expect(buildOnboardingHabitInput({
      sentence,
      locale: 'en',
      emoji: '',
      days: [],
      dueTime: '',
    })).toMatchObject(expected)
  })

  it('previews the notification fifteen minutes before the due time', () => {
    expect(getOnboardingReminderPreviewTime('18:00')).toBe('17:45')
    expect(getOnboardingReminderPreviewTime('00:10')).toBe('23:55')
    expect(getOnboardingReminderPreviewTime('')).toBeNull()
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
