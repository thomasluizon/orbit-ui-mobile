import { describe, expect, it } from 'vitest'
import {
  HABIT_REMINDER_PRESETS,
  formatHabitTimeInput,
  isValidHabitTimeInput,
  validateHabitFormInput,
} from '../utils/habit-form-helpers'

describe('habit form helpers', () => {
  it('formats time input into hh:mm', () => {
    expect(formatHabitTimeInput('1234')).toBe('12:34')
    expect(formatHabitTimeInput('12a3b4')).toBe('12:34')
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
})
