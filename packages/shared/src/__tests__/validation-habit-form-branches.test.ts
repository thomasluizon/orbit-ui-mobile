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
  validateEndDate,
  validateHabitForm,
  habitFormSchemaForType,
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
    monthDays: [],
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


it('rejects an end time without an exact start time at submission', () => {
  expect(validateHabitForm(makeFormData({ dueTime: '', dueEndTime: '09:00' }))).toBe('habits.form.endTimeRequiresStart')
  expect(validateHabitForm(makeFormData({ dueTime: '08:00', dueEndTime: '09:00' }))).toBeNull()
})


it.each([
  ['task', 'taskTitleTooLong', 'taskDescriptionTooLong', 'taskEmojiTooLong'],
  ['habit', 'titleTooLong', 'descriptionTooLong', 'emojiTooLong'],
] as const)('retains the %s text limits in the selected schema', (itemType, title, description, emoji) => {
  const schema = habitFormSchemaForType(itemType)
  for (const [field, length, key] of [['title', 201, title], ['description', 10001, description], ['emoji', 33, emoji]] as const) {
    expect(() => schema.parse(makeFormData({ itemType, [field]: 'x'.repeat(length) }))).toThrow(`habits.form.${key}`)
  }
})

it.each([
  ['habit', 'title', MAX_HABIT_TITLE_LENGTH, 'titleTooLong'],
  ['task', 'title', MAX_HABIT_TITLE_LENGTH, 'taskTitleTooLong'],
  ['habit', 'description', MAX_HABIT_DESCRIPTION_LENGTH, 'descriptionTooLong'],
  ['task', 'description', MAX_HABIT_DESCRIPTION_LENGTH, 'taskDescriptionTooLong'],
  ['habit', 'emoji', MAX_HABIT_EMOJI_LENGTH, 'emojiTooLong'],
  ['task', 'emoji', MAX_HABIT_EMOJI_LENGTH, 'taskEmojiTooLong'],
] as const)('validates %s %s through the form in schema order', (itemType, field, limit, key) => {
  expect(validateHabitForm(makeFormData({ itemType, [field]: 'x'.repeat(limit + 1) }))).toBe(`habits.form.${key}`)
  expect(validateHabitForm(makeFormData({ itemType, [field]: 'x'.repeat(limit) }))).toBeNull()
})

it('keeps title, description and emoji error priority', () => {
  const form = makeFormData({ title: '', description: 'x'.repeat(10001), emoji: 'x'.repeat(33) })
  expect(validateHabitForm(form)).toBe('habits.form.titleRequired')
  expect(validateHabitForm({ ...form, title: 'Read' })).toBe('habits.form.descriptionTooLong')
  expect(validateHabitForm({ ...form, title: 'Read', description: '' })).toBe('habits.form.emojiTooLong')
  expect(validateHabitForm(makeFormData({ emoji: undefined }))).toBeNull()
})

it('accepts fifteen combined reminders and rejects sixteen', () => {
  expect(validateReminderSelection(true, '09:00', Array.from({ length: 15 }, (_, index) => index), [])).toBeNull()
  expect(validateReminderSelection(true, '09:00', Array.from({ length: 16 }, (_, index) => index), [])).toBe('habits.form.relativeReminderMax')
})

it.each([-1439, 10080])('accepts relative reminder bound %s', (minutes) => {
  expect(validateReminderSelection(true, '09:00', [minutes], [])).toBeNull()
})

it.each([-1440, 10081])('rejects relative reminder outside bound %s', (minutes) => {
  expect(validateReminderSelection(true, '09:00', [minutes], [])).toBe('habits.form.invalidRelativeReminder')
})

it.each([
  { intervalMinutes: 3 },
  { intervalMinutes: 30, activeStart: '08:00', activeEnd: null },
  { intervalMinutes: 30, activeStart: '08:00', activeEnd: '08:00' },
  { intervalMinutes: 30, activeStart: '08:00', activeEnd: '25:00' },
  { intervalMinutes: 30, startAtUtc: 'invalid' },
])('rejects an invalid repeat reminder %j', (repeatReminder) => {
  expect(validateHabitForm(makeFormData({ reminderEnabled: true, repeatReminder }))).toBe('habits.form.repeatInvalid')
})
