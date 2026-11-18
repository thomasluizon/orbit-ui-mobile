import { describe, expect, it } from 'vitest'
import type { HabitSetupSuggestion } from '../types/habit'
import type { OnboardingSchedule } from '../utils/onboarding'
import {
  changeOnboardingScheduleMode,
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingProposal,
  canRepeatOnboardingScheduleWeeks,
  clampOnboardingRepeatWeeks,
  getOnboardingCompleteCopy,
  isOnboardingHabitDueToday,
  toggleOnboardingScheduleDay,
  getOnboardingReminderPreviewTime,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingRemindCopy,
  getOnboardingScheduleMode,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_STARTERS,
  shouldRequestOnboardingSuggestion,
} from '../utils/onboarding'
import { getHabitPhraseTitle } from '../utils/habit-phrase-title'

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

  it('uses available anonymous attestation and keeps unavailable or signed-in capped reads local', () => {
    expect(shouldRequestOnboardingSuggestion({ isLive: false, atLimit: false, available: true })).toBe(true)
    expect(shouldRequestOnboardingSuggestion({ isLive: false, atLimit: false, available: false })).toBe(false)
    expect(shouldRequestOnboardingSuggestion({ isLive: true, atLimit: false, available: false })).toBe(false)
    expect(shouldRequestOnboardingSuggestion({ isLive: true, atLimit: true, available: true })).toBe(false)
  })

  it('keeps three decisions while the done screen rests at 03 of 03', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingDisplayStep(ONBOARDING_DONE_STEP)).toBe(3)
    expect(getOnboardingDisplayStep(ONBOARDING_REMIND_STEP)).toBe(3)
  })

  it('removes schedule words from the habit title', () => {
    expect(getHabitPhraseTitle('Walk every Monday and Thursday at 18:00', 'en')).toBe('Walk')
    expect(getHabitPhraseTitle('Caminhar toda segunda e quinta às 18:00', 'pt-BR')).toBe('Caminhar')
  })

  it.each([
    ['Read a book', 'en'],
    ['Work on posture', 'en'],
    ['Ler um livro', 'pt-BR'],
    ['Trabalhar na postura', 'pt-BR'],
  ] as const)('preserves an ordinary title byte for byte: %s', (sentence, locale) => {
    expect(getHabitPhraseTitle(sentence, locale)).toBe(sentence)
  })

  it('trims a padded sentence the phrase reader leaves alone', () => {
    expect(getHabitPhraseTitle('  Read a book  ', 'en')).toBe('Read a book')
    expect(getHabitPhraseTitle('  Ler um livro  ', 'pt-BR')).toBe('Ler um livro')
  })

  it('removes only connectors orphaned by consumed schedule words', () => {
    expect(getHabitPhraseTitle('Work on posture every Monday', 'en')).toBe('Work on posture')
    expect(getHabitPhraseTitle('Trabalhar na postura toda segunda', 'pt-BR')).toBe('Trabalhar na postura')
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

  it('gives a flexible Orbit suggestion the period both screens show', () => {
    const { schedule } = buildOnboardingProposal({
      emoji: '🚶',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    }, 'Walk outside', 'en')

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

  it('uses an Orbit suggestion as the schedule shown for confirmation when the sentence gives no schedule', () => {
    expect(buildOnboardingProposal({
      emoji: '🚶',
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '18:00',
      subHabits: [],
      checklistItems: [],
    }, 'Walk outside', 'en')).toEqual({
      schedule: {
        frequencyUnit: 'Week',
        frequencyQuantity: 3,
        intervalWeeks: 1,
        days: [],
        isGeneral: false,
        isFlexible: true,
        dueTime: '18:00',
      },
      emoji: '🚶',
    })
  })

  const everyDayAtSeven: HabitSetupSuggestion = { emoji: '🌿', frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] }
  it.each([
    ['a time', 'Water the plants at 9am', { frequencyUnit: 'Day', days: [], isFlexible: false, dueTime: '09:00' }, '🌿'],
    ['a repeat', 'Water the plants 3 times a week', { frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true, dueTime: '07:00' }, '🌿'],
    ['a day', 'Water the plants every monday', { frequencyUnit: 'Day', days: ['Monday'], isFlexible: false, dueTime: '07:00' }, '🌿'],
    ['an emoji', '💧 Water the plants', { frequencyUnit: 'Day', days: [], isFlexible: false, dueTime: '07:00' }, ''],
    ['a bare interval', 'Water the plants every 2 weeks', { frequencyUnit: 'Week', frequencyQuantity: 2, days: [], isFlexible: false, dueTime: '07:00' }, '🌿'],
    ['no emoji when the sentence holds only a text sign', 'Buy Coca-Cola® zero', { frequencyUnit: 'Day', days: [], isFlexible: false, dueTime: '07:00' }, '🌿'],
  ] as const)('keeps %s the person typed in the sentence over the Orbit suggestion, which fills only the rest', (_field, sentence, schedule, emoji) => {
    const proposal = buildOnboardingProposal(everyDayAtSeven, sentence, 'en')
    expect(proposal).toMatchObject({ schedule: { ...schedule, isGeneral: false }, emoji })
  })

  it('reads a day of the month as the month unit only in the guided flow, and keeps the legacy flow open with the Orbit suggestion', () => {
    const sentence = 'Pay the rent every 5th of the month'
    expect(buildOnboardingScheduleFromPhrase(sentence, 'en', true)).toMatchObject({ frequencyUnit: 'Month', frequencyQuantity: 1, isGeneral: false })
    expect(buildOnboardingProposal(everyDayAtSeven, sentence, 'en', true).schedule).toMatchObject({ frequencyUnit: 'Month', frequencyQuantity: 1, days: [], isGeneral: false, dueTime: '07:00' })
    expect(buildOnboardingScheduleFromPhrase(sentence, 'en')).toMatchObject({ frequencyUnit: null, frequencyQuantity: null, isGeneral: true })
    expect(buildOnboardingProposal(everyDayAtSeven, sentence, 'en').schedule).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isGeneral: false, dueTime: '07:00' })
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
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, days: ['Monday', 'Thursday'] }, wednesday, 'UTC')).toBe(false)
  })

  it('reports a weekday schedule that names today as due', () => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, days: ['Wednesday'] }, wednesday, 'UTC')).toBe(true)
  })

  it.each([
    ['2026-09-14T02:00:00.000Z', 'America/Sao_Paulo', 'Sunday'],
    ['2026-09-14T00:30:00.000Z', 'UTC', 'Monday'],
  ])('uses the account weekday at %s in %s', (instant, timeZone, weekday) => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, days: [weekday] }, new Date(instant), timeZone)).toBe(true)
  })

  it('reports a general schedule as absent from today, whatever the weekday', () => {
    const general = { ...weekdaySchedule, days: [], isGeneral: true, frequencyUnit: null, frequencyQuantity: null }
    expect(isOnboardingHabitDueToday(general, wednesday, 'UTC')).toBe(false)
    expect(isOnboardingHabitDueToday(general, new Date(2026, 8, 14), 'UTC')).toBe(false)
  })

  it.each([
    ['one time', { days: [], isGeneral: false, frequencyUnit: null, frequencyQuantity: null }],
    ['flexible', { days: [], isGeneral: false, isFlexible: true, frequencyUnit: 'Week' as const, frequencyQuantity: 3 }],
    ['interval', { days: [], isGeneral: false, frequencyUnit: 'Week' as const, frequencyQuantity: 2 }],
  ])('anchors a %s schedule on today', (_label, patch) => {
    expect(isOnboardingHabitDueToday({ ...weekdaySchedule, ...patch }, wednesday, 'UTC')).toBe(true)
  })
})

describe('getOnboardingCompleteCopy', () => {
  const resting = { skipped: false, signedOut: false, remindersOff: false, dueToday: true, general: false }

  it('says the habit is in the day only when it is due today', () => {
    expect(getOnboardingCompleteCopy(resting)).toEqual({
      titleKey: 'title', bodyKey: 'body', pendingKey: 'pending', actionKey: 'seeDay',
    })
    expect(getOnboardingCompleteCopy({ ...resting, dueToday: false })).toEqual({
      titleKey: 'notTodayTitle', bodyKey: 'notTodayBody', pendingKey: 'notTodayPending', actionKey: 'seeDay',
    })
  })

  it('never offers a reminder or a day to a general habit', () => {
    expect(getOnboardingCompleteCopy({ ...resting, general: true, dueToday: false, remindersOff: true })).toMatchObject({
      titleKey: 'generalTitle', bodyKey: 'generalBody', pendingKey: 'generalPending',
    })
  })

  it('reports the local draft first when a general habit is built signed out', () => {
    expect(getOnboardingCompleteCopy({ ...resting, general: true, signedOut: true, dueToday: false, remindersOff: true })).toEqual({
      titleKey: 'signedOutTitle', bodyKey: 'signedOutBody', pendingKey: 'generalPending', actionKey: 'signIn',
    })
  })

  it('carries the reminders-off line into both due states', () => {
    expect(getOnboardingCompleteCopy({ ...resting, remindersOff: true }).bodyKey).toBe('remindersOffBody')
    expect(getOnboardingCompleteCopy({ ...resting, remindersOff: true, dueToday: false }).bodyKey).toBe('notTodayRemindersOffBody')
  })

  it('reports a skip as a skip even when the person is signed out', () => {
    expect(getOnboardingCompleteCopy({ ...resting, skipped: true, signedOut: true })).toMatchObject({
      titleKey: 'skippedSignedOutTitle', bodyKey: 'skippedSignedOutBody',
    })
    expect(getOnboardingCompleteCopy({ ...resting, skipped: true })).toMatchObject({
      titleKey: 'skippedTitle', bodyKey: 'skippedBody',
    })
    expect(getOnboardingCompleteCopy({ ...resting, signedOut: true })).toMatchObject({
      titleKey: 'signedOutTitle', bodyKey: 'signedOutBody',
    })
  })

  it('points the body and the button at the same destination', () => {
    for (const skipped of [false, true]) {
      expect(getOnboardingCompleteCopy({ ...resting, skipped, signedOut: true }).actionKey).toBe('signIn')
      expect(getOnboardingCompleteCopy({ ...resting, skipped }).actionKey).toBe('seeDay')
    }
    expect(getOnboardingCompleteCopy({ ...resting, skipped: true }).bodyKey).toBe('skippedBody')
  })
})

describe('getOnboardingRemindCopy', () => {
  it.each([
    ['ask', 'title', 'body', 'signedOutBody'],
    ['denied', 'deniedTitle', 'deniedBody', 'deniedSignedOutBody'],
    ['refused', 'refusedTitle', 'refusedBody', 'refusedSignedOutBody'],
    ['unsupported', 'unsupportedTitle', 'unsupportedBody', 'unsupportedSignedOutBody'],
    ['failed', 'failedTitle', 'failedBody', 'failedSignedOutBody'],
  ] as const)('never tells a signed-out run the %s habit is saved', (state, titleKey, liveBodyKey, signedOutBodyKey) => {
    expect(getOnboardingRemindCopy(state, true)).toEqual({ titleKey, bodyKey: liveBodyKey })
    expect(getOnboardingRemindCopy(state, false)).toEqual({ titleKey, bodyKey: signedOutBodyKey })
  })

  it.each([
    ['no-time', 'noTimeTitle', 'noTimeBody'],
    ['no-day', 'noDayTitle', 'noDayBody'],
  ] as const)('keeps one %s body, because it claims nothing about storage', (state, titleKey, bodyKey) => {
    expect(getOnboardingRemindCopy(state, true)).toEqual({ titleKey, bodyKey })
    expect(getOnboardingRemindCopy(state, false)).toEqual({ titleKey, bodyKey })
  })
})

describe('onboarding schedule correction', () => {
  it('uses one schedule model for proposal rendering and correction', () => {
    const recurring = { frequencyUnit: 'Month' as const, frequencyQuantity: 2, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false, dueTime: '' }
    expect(getOnboardingScheduleMode(recurring)).toBe('interval')
    expect(changeOnboardingScheduleMode(recurring, 'oneTime')).toMatchObject({ frequencyUnit: null, frequencyQuantity: null, isGeneral: false, isFlexible: false })
  })
})
