import { describe, expect, it } from 'vitest'
import {
  HABIT_REMINDER_PRESETS,
  formatHabitTimeInput,
  isValidHabitTimeInput,
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
    expect(isValidHabitTimeInput('9:30')).toBe(true)
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
})
