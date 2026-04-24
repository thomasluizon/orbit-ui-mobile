import { describe, it, expect } from 'vitest'
import {
  habitFormSchema,
  validateEndDate,
  validateEndTime,
  validateTime,
  validateFrequency,
  validateScheduledReminders,
  validateHabitForm,
} from '../validation/habit-form'
import { goalFormSchema } from '../validation/goal-form'
import { validateTagForm } from '../validation/tag-form'

// ---------------------------------------------------------------------------
// habitFormSchema
// ---------------------------------------------------------------------------

describe('habitFormSchema', () => {
  it('parses a minimal valid habit form', () => {
    const result = habitFormSchema.safeParse({ title: 'Exercise' })
    expect(result.success).toBe(true)
  })

  it('applies defaults for optional fields', () => {
    const result = habitFormSchema.safeParse({ title: 'Exercise' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBe('')
      expect(result.data.emoji).toBe('')
      expect(result.data.days).toEqual([])
      expect(result.data.isBadHabit).toBe(false)
      expect(result.data.isGeneral).toBe(false)
      expect(result.data.isFlexible).toBe(false)
      expect(result.data.dueDate).toBe('')
      expect(result.data.dueTime).toBe('')
      expect(result.data.dueEndTime).toBe('')
      expect(result.data.endDate).toBe('')
      expect(result.data.reminderEnabled).toBe(false)
      expect(result.data.scheduledReminders).toEqual([])
      expect(result.data.slipAlertEnabled).toBe(false)
      expect(result.data.checklistItems).toEqual([])
    }
  })

  it('rejects empty title', () => {
    const result = habitFormSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })

  it('trims whitespace from title', () => {
    const result = habitFormSchema.safeParse({ title: '  Exercise  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Exercise')
    }
  })

  it('accepts full habit form with all fields', () => {
    const result = habitFormSchema.safeParse({
      title: 'Morning Run',
      description: 'Run 5km every morning',
      emoji: '🏃',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Mon', 'Tue', 'Wed'],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2025-01-01',
      dueTime: '06:00',
      dueEndTime: '07:00',
      endDate: '2025-12-31',
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day', time: '05:30' }],
      slipAlertEnabled: true,
      checklistItems: [{ text: 'Warm up', isChecked: false }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid frequencyUnit', () => {
    const result = habitFormSchema.safeParse({
      title: 'Test',
      frequencyUnit: 'Hourly',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative frequencyQuantity', () => {
    const result = habitFormSchema.safeParse({
      title: 'Test',
      frequencyQuantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer frequencyQuantity', () => {
    const result = habitFormSchema.safeParse({
      title: 'Test',
      frequencyQuantity: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects emoji values exceeding max length', () => {
    const result = habitFormSchema.safeParse({
      title: 'Test',
      emoji: 'x'.repeat(33),
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// goalFormSchema
// ---------------------------------------------------------------------------

describe('goalFormSchema', () => {
  it('parses a minimal valid goal form', () => {
    const result = goalFormSchema.safeParse({ title: 'Read 12 Books' })
    expect(result.success).toBe(true)
  })

  it('applies defaults for optional fields', () => {
    const result = goalFormSchema.safeParse({ title: 'Lose Weight' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBe('')
      expect(result.data.unit).toBe('')
      expect(result.data.deadline).toBe('')
      expect(result.data.habitIds).toEqual([])
    }
  })

  it('rejects empty title', () => {
    const result = goalFormSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects title exceeding 200 characters', () => {
    const result = goalFormSchema.safeParse({ title: 'x'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('accepts title at exactly 200 characters', () => {
    const result = goalFormSchema.safeParse({ title: 'x'.repeat(200) })
    expect(result.success).toBe(true)
  })

  it('rejects description exceeding 500 characters', () => {
    const result = goalFormSchema.safeParse({
      title: 'Valid',
      description: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('accepts full goal form', () => {
    const result = goalFormSchema.safeParse({
      title: 'Read 12 Books',
      description: 'One book per month',
      targetValue: 12,
      unit: 'books',
      deadline: '2025-12-31',
      habitIds: ['h-1', 'h-2'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative targetValue', () => {
    const result = goalFormSchema.safeParse({
      title: 'Test',
      targetValue: -5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero targetValue', () => {
    const result = goalFormSchema.safeParse({
      title: 'Test',
      targetValue: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateEndDate
// ---------------------------------------------------------------------------

describe('validateEndDate', () => {
  it('returns null when both dates are empty', () => {
    expect(validateEndDate('', '')).toBeNull()
  })

  it('returns null when endDate is empty', () => {
    expect(validateEndDate('2025-01-01', '')).toBeNull()
  })

  it('returns null when dueDate is empty', () => {
    expect(validateEndDate('', '2025-12-31')).toBeNull()
  })

  it('returns null when endDate is after dueDate', () => {
    expect(validateEndDate('2025-01-01', '2025-12-31')).toBeNull()
  })

  it('returns null when endDate equals dueDate', () => {
    expect(validateEndDate('2025-06-15', '2025-06-15')).toBeNull()
  })

  it('returns error key when endDate is before dueDate', () => {
    expect(validateEndDate('2025-06-15', '2025-01-01')).toBe(
      'habits.form.endDateBeforeDueDate',
    )
  })
})

// ---------------------------------------------------------------------------
// validateEndTime
// ---------------------------------------------------------------------------

describe('validateEndTime', () => {
  it('returns null when both times are empty', () => {
    expect(validateEndTime('', '')).toBeNull()
  })

  it('returns null when dueTime is empty', () => {
    expect(validateEndTime('', '10:00')).toBeNull()
  })

  it('returns null when dueEndTime is empty', () => {
    expect(validateEndTime('09:00', '')).toBeNull()
  })

  it('returns null when endTime is after startTime', () => {
    expect(validateEndTime('09:00', '10:00')).toBeNull()
  })

  it('returns error key when endTime equals startTime', () => {
    expect(validateEndTime('09:00', '09:00')).toBe(
      'habits.form.endTimeBeforeStartTime',
    )
  })

  it('returns error key when endTime is before startTime', () => {
    expect(validateEndTime('10:00', '09:00')).toBe(
      'habits.form.endTimeBeforeStartTime',
    )
  })
})

// ---------------------------------------------------------------------------
// validateTime
// ---------------------------------------------------------------------------

describe('validateTime', () => {
  it('returns null for empty string', () => {
    expect(validateTime('')).toBeNull()
  })

  it('returns error for partial time input', () => {
    expect(validateTime('9:00')).toBe('habits.form.invalidTime')
    expect(validateTime('12')).toBe('habits.form.invalidTime')
  })

  it('returns null for valid 00:00', () => {
    expect(validateTime('00:00')).toBeNull()
  })

  it('returns null for valid 23:59', () => {
    expect(validateTime('23:59')).toBeNull()
  })

  it('returns null for valid 12:30', () => {
    expect(validateTime('12:30')).toBeNull()
  })

  it('returns error for hours > 23', () => {
    expect(validateTime('24:00')).toBe('habits.form.invalidTime')
  })

  it('returns error for minutes > 59', () => {
    expect(validateTime('12:60')).toBe('habits.form.invalidTime')
  })

  it('returns error for negative hours', () => {
    expect(validateTime('-1:00')).toBe('habits.form.invalidTime')
  })

  it('returns error for non-numeric input', () => {
    expect(validateTime('ab:cd')).toBe('habits.form.invalidTime')
  })
})

// ---------------------------------------------------------------------------
// validateFrequency
// ---------------------------------------------------------------------------

describe('validateFrequency', () => {
  it('returns null for one-time habits (no frequency, not general, not flexible)', () => {
    expect(validateFrequency(null, null, false, false)).toBeNull()
  })

  it('returns null for general habits regardless of frequency', () => {
    expect(validateFrequency(null, null, true, false)).toBeNull()
  })

  it('returns error when frequencyQuantity is missing for recurring habit', () => {
    expect(validateFrequency('Day', null, false, false)).toBe(
      'habits.form.frequencyRequired',
    )
  })

  it('returns error when frequencyQuantity is 0', () => {
    expect(validateFrequency('Week', 0, false, false)).toBe(
      'habits.form.frequencyRequired',
    )
  })

  it('returns null for valid recurring habit', () => {
    expect(validateFrequency('Day', 1, false, false)).toBeNull()
  })

  it('returns error when flexible habit has no frequency unit', () => {
    expect(validateFrequency(null, 3, false, true)).toBe(
      'habits.form.frequencyRequired',
    )
  })

  it('returns null for valid flexible habit', () => {
    expect(validateFrequency('Week', 3, false, true)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateScheduledReminders
// ---------------------------------------------------------------------------

describe('validateScheduledReminders', () => {
  it('returns null for empty reminders array', () => {
    expect(validateScheduledReminders([])).toBeNull()
  })

  it('returns null for valid reminder', () => {
    expect(
      validateScheduledReminders([{ when: 'same_day', time: '09:00' }]),
    ).toBeNull()
  })

  it('returns error for invalid reminder time', () => {
    expect(
      validateScheduledReminders([{ when: 'same_day', time: '25:00' }]),
    ).toBe('habits.form.invalidScheduledReminderTime')
  })

  it('returns error for partial reminder time', () => {
    expect(
      validateScheduledReminders([{ when: 'same_day', time: '12' }]),
    ).toBe('habits.form.invalidScheduledReminderTime')
  })

  it('returns error for duplicate reminders', () => {
    expect(
      validateScheduledReminders([
        { when: 'same_day', time: '09:00' },
        { when: 'same_day', time: '09:00' },
      ]),
    ).toBe('habits.form.duplicateScheduledReminder')
  })

  it('allows same time with different when values', () => {
    expect(
      validateScheduledReminders([
        { when: 'same_day', time: '09:00' },
        { when: 'day_before', time: '09:00' },
      ]),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateTagForm
// ---------------------------------------------------------------------------

describe('validateTagForm', () => {
  it('returns null for valid input', () => {
    expect(validateTagForm('Work', '#FF5733')).toBeNull()
  })

  it('returns error for empty name', () => {
    expect(validateTagForm('   ', '#FF5733')).toBe('habits.form.tagNameRequired')
  })

  it('returns error for long name', () => {
    expect(validateTagForm('a'.repeat(51), '#FF5733')).toBe('habits.form.tagNameTooLong')
  })

  it('returns error for invalid color', () => {
    expect(validateTagForm('Work', 'red')).toBe('habits.form.tagColorInvalid')
  })
})

// ---------------------------------------------------------------------------
// validateHabitForm (integration)
// ---------------------------------------------------------------------------

describe('validateHabitForm', () => {
  it('returns null for valid minimal form', () => {
    const data = habitFormSchema.parse({ title: 'Exercise' })
    expect(validateHabitForm(data)).toBeNull()
  })

  it('returns error for empty title', () => {
    const data = {
      title: '   ',
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
    }
    expect(validateHabitForm(data)).toBe('habits.form.titleRequired')
  })

  it('catches endDate before dueDate', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.dueDate = '2025-06-15'
    data.endDate = '2025-01-01'
    expect(validateHabitForm(data)).toBe('habits.form.endDateBeforeDueDate')
  })

  it('catches invalid dueTime', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.dueTime = '25:00'
    expect(validateHabitForm(data)).toBe('habits.form.invalidTime')
  })

  it('catches endTime before startTime', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.dueTime = '10:00'
    data.dueEndTime = '09:00'
    expect(validateHabitForm(data)).toBe('habits.form.endTimeBeforeStartTime')
  })

  it('catches invalid scheduled reminder when reminders enabled', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.reminderEnabled = true
    data.scheduledReminders = [{ when: 'same_day', time: '25:00' }]
    expect(validateHabitForm(data)).toBe(
      'habits.form.invalidScheduledReminderTime',
    )
  })

  it('skips scheduled reminder validation when reminders disabled', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.reminderEnabled = false
    data.scheduledReminders = [{ when: 'same_day', time: '25:00' }]
    expect(validateHabitForm(data)).toBeNull()
  })

  it('returns first error encountered (title before frequency)', () => {
    const data = {
      title: '   ',
      description: '',
      emoji: '',
      frequencyUnit: 'Day' as const,
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
    }
    expect(validateHabitForm(data)).toBe('habits.form.titleRequired')
  })

  it('catches general habits marked as bad habits', () => {
    const data = habitFormSchema.parse({ title: 'Test' })
    data.isGeneral = true
    data.isBadHabit = true
    expect(validateHabitForm(data)).toBe('habits.form.generalBadHabit')
  })
})
