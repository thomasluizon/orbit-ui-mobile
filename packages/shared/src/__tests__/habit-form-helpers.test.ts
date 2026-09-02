import { describe, expect, it } from 'vitest'
import {
  EMPTY_HABIT_FORM_PROPOSAL,
  HABIT_REMINDER_PRESETS,
  applyHabitPhraseRead,
  buildHabitDaysList,
  buildHabitFrequencyUnits,
  buildHabitUnderstandingSentence,
  formatHabitReminderLabel,
  formatHabitTimeInput,
  getHabitFormFlags,
  hasHabitFormProposal,
  isHabitAstraLimitReached,
  isValidHabitTimeInput,
  normalizeHabitFormData,
  resolveHabitStartDate,
  shouldShowHabitAstraFallback,
  validateHabitFormInput,
} from '../utils/habit-form-helpers'
import {
  filterHabitEmojiCategories,
  HABIT_EMOJI_CATEGORIES,
  HABIT_EMOJI_OPTIONS,
} from '../utils/habit-emoji-options'

describe('habit form helpers', () => {
  it('normalizes missing habit form values', () => {
    expect(normalizeHabitFormData({ title: 'Exercise' })).toMatchObject({
      title: 'Exercise',
      description: '',
      emoji: '',
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      dueDate: '',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    })
  })

  it('filters habit emoji categories by habit-focused keywords', () => {
    const results = filterHabitEmojiCategories('run')
    const emojis = results.flatMap((category) => category.emojis)

    expect(HABIT_EMOJI_OPTIONS.length).toBeGreaterThan(100)
    expect(emojis).toContain('🏃')
    expect(emojis).toContain('🏃‍♀️')
  })

  it('filters habit emojis by Portuguese names without accents', () => {
    const runResults = filterHabitEmojiCategories('corrida')
    const dogResults = filterHabitEmojiCategories('cão')

    expect(runResults.flatMap((category) => category.emojis)).toContain('🏃')
    expect(dogResults.flatMap((category) => category.emojis)).toContain('🐶')
  })

  it('keeps animal emojis out of the nature category', () => {
    const natureCategory = HABIT_EMOJI_CATEGORIES.find((category) => category.id === 'nature')
    const animalsCategory = HABIT_EMOJI_CATEGORIES.find((category) => category.id === 'animals')

    expect(natureCategory?.emojis).not.toContain('🐶')
    expect(animalsCategory?.emojis).toContain('🐶')
  })

  it('derives display flags for one-time, recurring, and general habits', () => {
    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'One-time',
        }),
      ),
    ).toMatchObject({
      isOneTime: true,
      isRecurring: false,
      showDayPicker: false,
      showEndDate: false,
    })

    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'Recurring',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
        }),
      ),
    ).toMatchObject({
      isOneTime: false,
      isRecurring: true,
      showDayPicker: true,
      showEndDate: true,
    })

    expect(
      getHabitFormFlags(
        normalizeHabitFormData({
          title: 'General',
          isGeneral: true,
          frequencyUnit: 'Week',
        }),
      ),
    ).toMatchObject({
      isGeneral: true,
      isRecurring: false,
      showEndDate: false,
    })
  })

  it('builds localized day lists and frequency units', () => {
    const translations = {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun',
      unitDay: 'Day',
      unitWeek: 'Week',
      unitMonth: 'Month',
      unitYear: 'Year',
    }

    expect(buildHabitDaysList(translations).map((day) => day.value)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    expect(buildHabitDaysList(translations, 0).map((day) => day.value)).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ])
    expect(buildHabitFrequencyUnits(translations)).toEqual([
      { value: 'Day', label: 'Day' },
      { value: 'Week', label: 'Week' },
      { value: 'Month', label: 'Month' },
      { value: 'Year', label: 'Year' },
    ])
  })

  it('formats time input into hh:mm', () => {
    expect(formatHabitTimeInput('1234')).toBe('12:34')
    expect(formatHabitTimeInput('12a3b4')).toBe('12:34')
    expect(formatHabitTimeInput('12345')).toBe('12:34')
  })

  it('validates time input only when it is complete', () => {
    expect(isValidHabitTimeInput('')).toBe(true)
    expect(isValidHabitTimeInput('09:30')).toBe(true)
    expect(isValidHabitTimeInput('25:00')).toBe(false)
    expect(isValidHabitTimeInput('9:30')).toBe(false)
  })

  it('exports the expected reminder presets', () => {
    expect(HABIT_REMINDER_PRESETS[0]).toEqual({
      value: 0,
      key: 'habits.form.reminderAtTime',
    })
    expect(HABIT_REMINDER_PRESETS.at(-1)).toEqual({
      value: 1440,
      key: 'habits.form.reminder1day',
    })
  })

  it('applies a time-only phrase as a one-time schedule', () => {
    const calls: string[] = []
    const fields: Record<string, string | number | string[]> = {}

    const ownership = applyHabitPhraseRead(true, {
      cadence: null,
      days: [],
      frequencyQuantity: null,
      dueTime: '15:00',
      emoji: null,
      consumed: [],
    }, '', false, { cadence: false, dueTime: false }, {
      setOneTime: () => calls.push('one-time'),
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
      setField: (field, value) => { fields[field] = value },
    })

    expect(calls).toEqual([])
    expect(fields).toEqual({ dueTime: '15:00' })
    expect(ownership).toEqual({ cadence: false, dueTime: true })
  })

  it('preserves a locked General schedule during phrase application', () => {
    const calls: string[] = []
    const fields: Record<string, string | number | string[]> = {}

    const ownership = applyHabitPhraseRead(true, {
      cadence: 'fixed',
      days: ['Monday'],
      frequencyQuantity: null,
      dueTime: '08:00',
      emoji: '🏃',
      consumed: [],
    }, '', true, { cadence: false, dueTime: false }, {
      setOneTime: () => calls.push('one-time'),
      setRecurring: () => calls.push('recurring'),
      setFlexible: () => calls.push('flexible'),
      setGeneral: () => calls.push('general'),
      setField: (field, value) => { fields[field] = value },
    })

    expect(calls).toEqual(['general'])
    expect(fields).toEqual({})
    expect(ownership).toEqual({ cadence: true, dueTime: true })
  })

  it('builds truthful daily, fixed-day, flexible, and time-only summaries', () => {
    const translate = (key: string, values?: Record<string, string | number>) =>
      `${key}:${JSON.stringify(values ?? {})}`
    const days = [{ value: 'Monday', label: 'Monday' }]

    expect(buildHabitUnderstandingSentence([], days, false, 'Day', 1, '', translate))
      .toBe('habits.form.understoodDaily:{}')
    expect(buildHabitUnderstandingSentence(['Monday'], days, false, 'Day', 1, '08:00', translate))
      .toBe('habits.form.understoodDaysAt:{"days":"Monday","time":"08:00"}')
    expect(buildHabitUnderstandingSentence([], days, true, 'Week', 3, '09:00', translate))
      .toBe('habits.form.understoodCountAt:{"count":3,"time":"09:00"}')
    expect(buildHabitUnderstandingSentence([], days, false, null, 3, '15:00', translate))
      .toBe('habits.form.understoodTime:{"time":"15:00"}')
  })

  it('tracks proposal visibility, Astra limits, start dates, and reminder labels', () => {
    const proposal = { ...EMPTY_HABIT_FORM_PROPOSAL, checklist: true }
    const translate = (key: string) => key

    expect(hasHabitFormProposal(EMPTY_HABIT_FORM_PROPOSAL)).toBe(false)
    expect(hasHabitFormProposal(proposal)).toBe(true)
    expect(shouldShowHabitAstraFallback('Read', null, () => true, EMPTY_HABIT_FORM_PROPOSAL)).toBe(true)
    expect(shouldShowHabitAstraFallback('Read', null, () => true, proposal)).toBe(false)
    expect(isHabitAstraLimitReached(4, 5)).toBe(false)
    expect(isHabitAstraLimitReached(5, 5)).toBe(true)
    expect(resolveHabitStartDate(undefined, '2026-09-02')).toBe('2026-09-02')
    expect(resolveHabitStartDate(null, '2026-09-02')).toBeNull()
    expect(formatHabitReminderLabel(0, translate)).toBe('habits.form.reminderAtTime')
    expect(formatHabitReminderLabel(31, translate)).toBe('31 habits.form.reminderMinutes')
    expect(formatHabitReminderLabel(61, translate)).toBe('1 habits.form.reminderHour')
    expect(formatHabitReminderLabel(2880, translate)).toBe('2 habits.form.reminderDays')
  })

  it('validates reminder selection with due-time reminders', () => {
    expect(
      validateHabitFormInput(
        {
          title: 'Exercise',
          dueTime: '09:00',
          reminderEnabled: true,
        },
        {
          reminderTimes: [],
        },
      ),
    ).toBe('habits.form.reminderMinimumOne')
  })

  it('validates reminder selection with scheduled reminders', () => {
    expect(
      validateHabitFormInput({
        title: 'Exercise',
        reminderEnabled: true,
      }),
    ).toBe('habits.form.reminderMinimumOne')
  })

  it('validates linked goal limit', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          selectedGoalIds: Array.from({ length: 11 }, (_, index) => `goal-${index}`),
        },
      ),
    ).toBe('habits.form.goalLimit')
  })

  it('validates selected tag limit', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          selectedTagIds: Array.from({ length: 6 }, (_, index) => `tag-${index}`),
        },
      ),
    ).toBe('habits.form.tagLimit')
  })

  it('validates sub-habit titles from context', () => {
    expect(
      validateHabitFormInput(
        { title: 'Exercise' },
        {
          subHabits: [''],
        },
      ),
    ).toBe('habits.form.subHabitTitleRequired')
  })

  it('returns null when the habit form input is valid', () => {
    expect(
      validateHabitFormInput(
        {
          title: 'Exercise',
          frequencyUnit: 'Week',
          frequencyQuantity: 3,
          dueTime: '09:00',
          reminderEnabled: true,
        },
        {
          reminderTimes: [0],
          selectedGoalIds: ['goal-1'],
          selectedTagIds: ['tag-1'],
          subHabits: ['Warm-up'],
        },
      ),
    ).toBeNull()
  })
})
