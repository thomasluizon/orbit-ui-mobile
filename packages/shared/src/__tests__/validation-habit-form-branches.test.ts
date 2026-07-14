import { describe, expect, it } from 'vitest'
import {
  MAX_CHECKLIST_ITEM_LENGTH,
  MAX_CHECKLIST_ITEMS,
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_EMOJI_LENGTH,
  MAX_HABIT_TITLE_LENGTH,
  MAX_SUB_HABITS,
} from '../validation/constants'
import {
  validateChecklistItems,
  validateDaysSelection,
  validateEmoji,
  validateEndDate,
  validateHabitForm,
  validateReminderSelection,
  validateScheduledReminders,
  validateSubHabits,
  type HabitFormData,
} from '../validation/habit-form'

function makeFormData(overrides: Partial<HabitFormData> = {}): HabitFormData {
  return {
    title: 'Read',
    description: '',
    emoji: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    days: [],
    isBadHabit: false,
    isGeneral: false,
    isFlexible: false,
    dueDate: '',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    reminderEnabled: false,
    scheduledReminders: [],
    slipAlertEnabled: false,
    checklistItems: [],
    ...overrides,
  }
}

describe('validateEndDate', () => {
  it('flags an end date before the due date and accepts equal or later ones', () => {
    expect(validateEndDate('2026-05-10', '2026-05-09')).toBe('habits.form.endDateBeforeDueDate')
    expect(validateEndDate('2026-05-10', '2026-05-10')).toBeNull()
    expect(validateEndDate('', '2026-05-09')).toBeNull()
  })
})

describe('validateEmoji', () => {
  it('rejects an over-long emoji and accepts short or empty ones', () => {
    expect(validateEmoji('x'.repeat(MAX_HABIT_EMOJI_LENGTH + 1))).toBe('habits.form.emojiTooLong')
    expect(validateEmoji('🔥')).toBeNull()
    expect(validateEmoji(undefined)).toBeNull()
  })
})

describe('validateChecklistItems', () => {
  it('enforces the item count and per-item length limits', () => {
    const tooMany = Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, () => ({ text: 'x', isChecked: false }))
    expect(validateChecklistItems(tooMany)).toBe('habits.form.checklistItemLimit')

    expect(
      validateChecklistItems([{ text: 'y'.repeat(MAX_CHECKLIST_ITEM_LENGTH + 1), isChecked: false }]),
    ).toBe('habits.form.checklistItemTooLong')

    expect(validateChecklistItems([{ text: 'Warm up', isChecked: true }])).toBeNull()
  })
})

describe('validateDaysSelection', () => {
  it('only allows explicit days for a once-per-day habit', () => {
    expect(validateDaysSelection('Week', 1, ['Monday'], false, false)).toBe('habits.form.daysOnlyForDaily')
    expect(validateDaysSelection('Day', 2, ['Monday'], false, false)).toBe('habits.form.daysOnlyForDaily')
    expect(validateDaysSelection('Day', 1, ['Monday'], false, false)).toBeNull()
    expect(validateDaysSelection('Week', 1, [], false, false)).toBeNull()
  })
})

describe('validateScheduledReminders', () => {
  it('rejects invalid times and duplicate entries', () => {
    expect(validateScheduledReminders([{ when: 'before', time: '99:99' }])).toBe(
      'habits.form.invalidScheduledReminderTime',
    )
    expect(
      validateScheduledReminders([
        { when: 'before', time: '08:00' },
        { when: 'before', time: '08:00' },
      ]),
    ).toBe('habits.form.duplicateScheduledReminder')
    expect(validateScheduledReminders([{ when: 'before', time: '08:00' }])).toBeNull()
  })

  it('rejects more than the maximum number of scheduled reminders', () => {
    const many = Array.from({ length: 6 }, (_unused, index) => ({
      when: 'before',
      time: `0${index}:00`,
    }))
    expect(validateScheduledReminders(many)).toBe('habits.form.scheduledReminderMax')
  })
})

describe('validateReminderSelection', () => {
  it('falls through to scheduled reminder validation when there is no due time', () => {
    expect(
      validateReminderSelection(true, '', [], [{ when: 'before', time: '99:99' }]),
    ).toBe('habits.form.invalidScheduledReminderTime')
    expect(validateReminderSelection(false, '', [], [])).toBeNull()
  })
})

describe('validateSubHabits', () => {
  it('enforces the count, required title and length limits', () => {
    expect(validateSubHabits(Array.from({ length: MAX_SUB_HABITS + 1 }, () => 'x'))).toBe(
      'habits.form.subHabitLimit',
    )
    expect(validateSubHabits(['   '])).toBe('habits.form.subHabitTitleRequired')
    expect(validateSubHabits(['z'.repeat(MAX_HABIT_TITLE_LENGTH + 1)])).toBe(
      'habits.form.subHabitTitleTooLong',
    )
    expect(validateSubHabits(['Stretch'])).toBeNull()
  })
})

describe('validateHabitForm', () => {
  it('rejects an over-long title, description, and general bad habit', () => {
    expect(validateHabitForm(makeFormData({ title: 'a'.repeat(MAX_HABIT_TITLE_LENGTH + 1) }))).toBe(
      'habits.form.titleTooLong',
    )
    expect(
      validateHabitForm(makeFormData({ description: 'd'.repeat(MAX_HABIT_DESCRIPTION_LENGTH + 1) })),
    ).toBe('habits.form.descriptionTooLong')
    expect(validateHabitForm(makeFormData({ isGeneral: true, isBadHabit: true }))).toBe(
      'habits.form.generalBadHabit',
    )
  })

  it('accepts a well-formed one-time habit with a short description', () => {
    expect(validateHabitForm(makeFormData({ title: 'Read a book', description: 'Fiction only' }))).toBeNull()
  })
})
