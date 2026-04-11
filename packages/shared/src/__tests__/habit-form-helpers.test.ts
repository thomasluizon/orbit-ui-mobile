import { describe, expect, it } from 'vitest'
import {
  HABIT_REMINDER_PRESETS,
  buildHabitDaysList,
  buildHabitFrequencyUnits,
  formatHabitTimeInput,
  getHabitFormFlags,
  isValidHabitTimeInput,
  normalizeHabitFormData,
  validateHabitFormInput,
} from '../utils/habit-form-helpers'

describe('habit form helpers', () => {
  it('normalizes missing habit form values', () => {
    expect(normalizeHabitFormData({ title: 'Exercise' })).toMatchObject({
      title: 'Exercise',
      description: '',
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
