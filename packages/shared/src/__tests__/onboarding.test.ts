import { describe, expect, it } from 'vitest'
import type { OnboardingSchedule } from '../utils/onboarding'
import {
  changeOnboardingScheduleMode,
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  canRepeatOnboardingScheduleWeeks,
  canSnapshotOnboardingEntry,
  clampOnboardingRepeatWeeks,
  getOnboardingCompleteCopy,
  getOnboardingHabitTitle,
  isOnboardingHabitDueToday,
  toggleOnboardingScheduleDay,
  getOnboardingReminderPreviewTime,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  getOnboardingScheduleMode,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_STARTERS,
  shouldRequestOnboardingSuggestion,
  resolveRetainedOnboarding,
  shouldHideOnboardingFooter,
} from '../utils/onboarding'

/** Every rule a saved onboarding schedule owes the API, named so a failure reads as the transition. */
function findScheduleViolations(
  label: string,
  schedule: OnboardingSchedule,
  request: ReturnType<typeof buildOnboardingHabitInput>,
): string[] {
  const violations: string[] = []
  if (request.isGeneral && request.frequencyUnit !== undefined) {
    violations.push(`${label} emitted frequencyUnit with isGeneral`)
  }
  if (request.isGeneral && request.frequencyQuantity !== undefined) {
    violations.push(`${label} emitted frequencyQuantity with isGeneral`)
  }
  if (schedule.intervalWeeks !== 1 && schedule.days.length === 0) {
    violations.push(`${label} kept intervalWeeks ${schedule.intervalWeeks} with no day`)
  }
  if (request.intervalWeeks !== schedule.intervalWeeks) {
    violations.push(`${label} sent intervalWeeks ${request.intervalWeeks} for ${schedule.intervalWeeks}`)
  }
  const dayAdded = toggleOnboardingScheduleDay(schedule, 'Monday')
  if (schedule.days.length === 0 && dayAdded.intervalWeeks !== 1) {
    violations.push(`${label} then Monday invented intervalWeeks ${dayAdded.intervalWeeks}`)
  }
  return violations
}

describe('onboarding helpers', () => {
  it('exposes the four sentence starters', () => {
    expect(ONBOARDING_STARTERS).toEqual(['water', 'walk', 'read', 'tidy'])
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

  it('trims a padded sentence the phrase reader leaves alone', () => {
    expect(getOnboardingHabitTitle('  Read a book  ', 'en')).toBe('Read a book')
    expect(getOnboardingHabitTitle('  Ler um livro  ', 'pt-BR')).toBe('Ler um livro')
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
      reminderEnabled: false,
      schedule: buildOnboardingScheduleFromPhrase('Walk every Monday and Thursday at 18:00', 'en'),
    })).toMatchObject({
      title: 'Walk', emoji: '🚶', frequencyUnit: 'Day', frequencyQuantity: 1,
      days: ['Monday', 'Thursday'], dueTime: '18:00', reminderEnabled: false,
      reminderTimes: [],
    })
  })

  it.each([
    { reminderEnabled: true, reminderTimes: [15] },
    { reminderEnabled: false, reminderTimes: [] },
  ])('keeps the reminder choice coherent when enabled is $reminderEnabled', ({ reminderEnabled, reminderTimes }) => {
    expect(buildOnboardingHabitInput({
      sentence: 'Walk every Monday at 18:00',
      locale: 'en',
      emoji: '🚶',
      reminderEnabled,
      schedule: buildOnboardingScheduleFromPhrase('Walk every Monday at 18:00', 'en'),
    })).toMatchObject({ reminderEnabled, reminderTimes })
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
      expected: { frequencyUnit: 'Week', frequencyQuantity: 2, intervalWeeks: 1 },
    },
  ])('preserves the parsed cadence for $sentence', ({ sentence, expected }) => {
    expect(buildOnboardingHabitInput({
      sentence,
      locale: 'en',
      emoji: '',
      reminderEnabled: false,
      schedule: buildOnboardingScheduleFromPhrase(sentence, 'en'),
    })).toMatchObject(expected)
  })

  it.each([
    ['Clean every 2 weeks', 'en'],
    ['Limpar a cada 2 semanas', 'pt-BR'],
  ] as const)('reads a typed repeat interval into the control that shows it: %s', (sentence, locale) => {
    const schedule = buildOnboardingScheduleFromPhrase(sentence, locale)

    expect(getOnboardingScheduleMode(schedule)).toBe('interval')
    expect(schedule).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 2, intervalWeeks: 1 })
  })

  it('clears the repeat interval when the last day goes', () => {
    const weekly: OnboardingSchedule = {
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 3,
      days: ['Monday'], isGeneral: false, isFlexible: false, dueTime: '08:00',
    }
    const general = toggleOnboardingScheduleDay(weekly, 'Monday')

    expect(general.days).toEqual([])
    expect(general.intervalWeeks).toBe(1)
    expect(buildOnboardingHabitInput({
      sentence: 'Read',
      locale: 'en',
      emoji: '',
      reminderEnabled: false,
      schedule: general,
    }).intervalWeeks).toBe(1)
  })

  it('keeps every schedule mode transition valid for the API', () => {
    const schedules = {
      fixed: {
        frequencyUnit: 'Day' as const,
        frequencyQuantity: 1,
        intervalWeeks: 3,
        days: ['Monday'],
        isGeneral: false,
        isFlexible: false,
        dueTime: '',
      },
      flexible: {
        frequencyUnit: 'Week' as const,
        frequencyQuantity: 3,
        intervalWeeks: 4,
        days: [],
        isGeneral: false,
        isFlexible: true,
        dueTime: '',
      },
      interval: {
        frequencyUnit: 'Month' as const,
        frequencyQuantity: 2,
        intervalWeeks: 5,
        days: [],
        isGeneral: false,
        isFlexible: false,
        dueTime: '',
      },
      oneTime: {
        frequencyUnit: null,
        frequencyQuantity: null,
        intervalWeeks: 1,
        days: [],
        isGeneral: false,
        isFlexible: false,
        dueTime: '',
      },
    }
    const modes = ['fixed', 'flexible', 'interval', 'oneTime'] as const
    const violations: string[] = []

    for (const sourceMode of modes) {
      for (const targetMode of modes) {
        const schedule = changeOnboardingScheduleMode(schedules[sourceMode], targetMode)
        const request = buildOnboardingHabitInput({
          sentence: 'Read',
          locale: 'en',
          emoji: '',
          reminderEnabled: false,
          schedule,
        })

        expect(getOnboardingScheduleMode(schedule), `${sourceMode} to ${targetMode}`).toBe(targetMode)
        violations.push(...findScheduleViolations(`${sourceMode} to ${targetMode}`, schedule, request))
      }
    }

    expect(violations).toEqual([])
  })

  it('gives a flexible Astra suggestion the period both screens show', () => {
    const schedule = buildOnboardingScheduleFromSuggestion({
      emoji: '🚶',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    expect(schedule).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true })
    expect(buildOnboardingHabitInput({
      sentence: 'Walk outside',
      locale: 'en',
      emoji: '',
      reminderEnabled: false,
      schedule,
    })).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true })
  })

  it('previews the notification fifteen minutes before the due time', () => {
    expect(getOnboardingReminderPreviewTime('18:00')).toBe('17:45')
    expect(getOnboardingReminderPreviewTime('00:10')).toBe('23:55')
    expect(getOnboardingReminderPreviewTime('')).toBeNull()
  })

  it('uses an Astra suggestion as the schedule shown for confirmation', () => {
    expect(buildOnboardingScheduleFromSuggestion({
      emoji: '🚶',
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '18:00',
      subHabits: [],
      checklistItems: [],
    })).toEqual({
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      intervalWeeks: 1,
      days: [],
      isGeneral: false,
      isFlexible: true,
      dueTime: '18:00',
    })
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

  it('uses one schedule model for proposal rendering and correction', () => {
    const recurring = {
      frequencyUnit: 'Month' as const,
      frequencyQuantity: 2,
      intervalWeeks: 1,
      days: [],
      isGeneral: false,
      isFlexible: false,
      dueTime: '',
    }
    expect(getOnboardingScheduleMode(recurring)).toBe('interval')
    expect(changeOnboardingScheduleMode(recurring, 'oneTime')).toMatchObject({
      frequencyUnit: null,
      frequencyQuantity: null,
      isGeneral: false,
      isFlexible: false,
    })
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

const weekdaySchedule: OnboardingSchedule = {
  frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 3,
  days: ['Monday'], isGeneral: false, isFlexible: false, dueTime: '',
}

describe('a repeat interval the run can actually save', () => {
  it('offers the stepper only to a signed-in weekday schedule', () => {
    expect(canRepeatOnboardingScheduleWeeks(weekdaySchedule, true)).toBe(true)
    expect(canRepeatOnboardingScheduleWeeks(weekdaySchedule, false)).toBe(false)
    expect(canRepeatOnboardingScheduleWeeks({ ...weekdaySchedule, days: [], isGeneral: true }, true)).toBe(false)
  })

  it('pins a signed-out interval to one week so no screen promises what apply drops', () => {
    expect(clampOnboardingRepeatWeeks(weekdaySchedule, false).intervalWeeks).toBe(1)
    expect(clampOnboardingRepeatWeeks(weekdaySchedule, true)).toBe(weekdaySchedule)
    const pinned = { ...weekdaySchedule, intervalWeeks: 1 }
    expect(clampOnboardingRepeatWeeks(pinned, false)).toBe(pinned)
  })

  it('keeps the parsed interval for a signed-in run and drops it for a signed-out one', () => {
    const parsed = buildOnboardingScheduleFromPhrase('Clean every 3 weeks on Monday', 'en')
    expect(parsed.intervalWeeks).toBe(3)
    expect(clampOnboardingRepeatWeeks(parsed, true).intervalWeeks).toBe(3)
    expect(clampOnboardingRepeatWeeks(parsed, false).intervalWeeks).toBe(1)
  })
})

describe('isOnboardingHabitDueToday', () => {
  const wednesday = new Date(2026, 8, 16)

  it('reports a weekday schedule that skips today as not due', () => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, days: ['Monday', 'Thursday'] }, wednesday)).toBe(false)
  })

  it('reports a weekday schedule that names today as due', () => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, days: ['Wednesday'] }, wednesday)).toBe(true)
  })

  it.each([
    ['general', { days: [], isGeneral: true, frequencyUnit: null, frequencyQuantity: null }],
    ['one time', { days: [], isGeneral: false, frequencyUnit: null, frequencyQuantity: null }],
    ['flexible', { days: [], isGeneral: false, isFlexible: true, frequencyUnit: 'Week' as const, frequencyQuantity: 3 }],
    ['interval', { days: [], isGeneral: false, frequencyUnit: 'Week' as const, frequencyQuantity: 2 }],
  ])('anchors a %s schedule on today', (_label, patch) => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, ...patch }, wednesday)).toBe(true)
  })
})

describe('getOnboardingCompleteCopy', () => {
  const resting = { skipped: false, signedOut: false, remindersOff: false, dueToday: true }

  it('says the habit is in the day only when it is due today', () => {
    expect(getOnboardingCompleteCopy(resting)).toEqual({ titleKey: 'title', bodyKey: 'body', pendingKey: 'pending' })
    expect(getOnboardingCompleteCopy({ ...resting, dueToday: false })).toEqual({
      titleKey: 'notTodayTitle', bodyKey: 'notTodayBody', pendingKey: 'notTodayPending',
    })
  })

  it('carries the reminders-off line into both due states', () => {
    expect(getOnboardingCompleteCopy({ ...resting, remindersOff: true }).bodyKey).toBe('remindersOffBody')
    expect(getOnboardingCompleteCopy({ ...resting, remindersOff: true, dueToday: false }).bodyKey).toBe('notTodayRemindersOffBody')
  })

  it('reports a skip as a skip even when the person is signed out', () => {
    expect(getOnboardingCompleteCopy({ ...resting, skipped: true, signedOut: true })).toMatchObject({
      titleKey: 'skippedTitle', bodyKey: 'skippedBody',
    })
    expect(getOnboardingCompleteCopy({ ...resting, signedOut: true })).toMatchObject({
      titleKey: 'signedOutTitle', bodyKey: 'signedOutBody',
    })
  })
})
