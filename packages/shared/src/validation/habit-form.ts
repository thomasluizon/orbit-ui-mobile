import { z } from 'zod'
import { frequencyUnitSchema, scheduledReminderTimeSchema, checklistItemSchema } from '../types/habit'
import {
  MAX_CHECKLIST_ITEM_LENGTH,
  MAX_CHECKLIST_ITEMS,
  MAX_GOALS_PER_HABIT,
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_ICON_LENGTH,
  MAX_HABIT_TITLE_LENGTH,
  MAX_SCHEDULED_REMINDERS,
  MAX_SUB_HABITS,
  MAX_TAGS_PER_HABIT,
} from './constants'

// --- Habit form schema ---

export const habitFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'habits.form.titleRequired')
    .max(MAX_HABIT_TITLE_LENGTH, 'habits.form.titleTooLong'),
  description: z
    .string()
    .max(MAX_HABIT_DESCRIPTION_LENGTH, 'habits.form.descriptionTooLong')
    .optional()
    .default(''),
  icon: z.string().nullable().optional(),
  frequencyUnit: frequencyUnitSchema.nullable().optional(),
  frequencyQuantity: z.number().int().min(1).nullable().optional(),
  days: z.array(z.string()).default([]),
  isBadHabit: z.boolean().default(false),
  isGeneral: z.boolean().default(false),
  isFlexible: z.boolean().default(false),
  dueDate: z.string().default(''),
  dueTime: z.string().default(''),
  dueEndTime: z.string().default(''),
  endDate: z.string().default(''),
  reminderEnabled: z.boolean().default(false),
  scheduledReminders: z.array(scheduledReminderTimeSchema).default([]),
  slipAlertEnabled: z.boolean().default(false),
  checklistItems: z.array(checklistItemSchema).default([]),
})

export type HabitFormData = z.infer<typeof habitFormSchema>

// --- Cross-field validation (returns i18n keys, not translated strings) ---

/**
 * Validate that endDate is not before dueDate.
 */
export function validateEndDate(dueDate: string, endDate: string): string | null {
  if (!endDate || !dueDate) return null
  if (endDate < dueDate) {
    return 'habits.form.endDateBeforeDueDate'
  }
  return null
}

/**
 * Validate that dueEndTime is after dueTime.
 */
export function validateEndTime(dueTime: string, dueEndTime: string): string | null {
  if (!dueTime || !dueEndTime) return null
  if (dueEndTime <= dueTime) {
    return 'habits.form.endTimeBeforeStartTime'
  }
  return null
}

/**
 * Validate a single HH:MM time string (24h format).
 * Pass the field name to distinguish error keys.
 */
export function validateTime(time: string): string | null {
  if (!time) return null
  if (time.length !== 5) return 'habits.form.invalidTime'
  const parts = time.split(':')
  const h = Number.parseInt(parts[0] ?? '', 10)
  const m = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return 'habits.form.invalidTime'
  }
  return null
}

/**
 * Validate frequency fields for non-one-time, non-general habits.
 */
export function validateFrequency(
  frequencyUnit: string | null | undefined,
  frequencyQuantity: number | null | undefined,
  isGeneral: boolean,
  isFlexible: boolean,
): string | null {
  const isOneTime = !frequencyUnit && !isGeneral && !isFlexible
  if (isOneTime || isGeneral) return null
  if (!frequencyQuantity || frequencyQuantity < 1) {
    return 'habits.form.frequencyRequired'
  }
  if (isFlexible && !frequencyUnit) {
    return 'habits.form.frequencyRequired'
  }
  return null
}

export function validateDescription(description: string | undefined): string | null {
  if (!description) return null
  if (description.length > MAX_HABIT_DESCRIPTION_LENGTH) {
    return 'habits.form.descriptionTooLong'
  }
  return null
}

/**
 * Validate a habit icon (emoji string). Returns i18n key or null.
 * null/undefined/empty after trim is valid (represents "no icon").
 */
export function validateHabitIcon(icon: string | null | undefined): string | null {
  if (icon === null || icon === undefined) return null
  const trimmed = icon.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_HABIT_ICON_LENGTH) {
    return 'habits.form.iconTooLong'
  }
  // Reject control characters (0x00-0x1F and 0x7F)
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return 'habits.form.iconInvalid'
  }
  return null
}

/**
 * Normalize a raw icon string for persistence. Trims whitespace and
 * collapses empty strings to null so the server never receives empty.
 */
export function normalizeHabitIcon(icon: string | null | undefined): string | null {
  if (icon === null || icon === undefined) return null
  const trimmed = icon.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function validateChecklistItems(
  checklistItems: Array<{ text: string; isChecked: boolean }>,
): string | null {
  if (checklistItems.length > MAX_CHECKLIST_ITEMS) {
    return 'habits.form.checklistItemLimit'
  }

  for (const item of checklistItems) {
    if (item.text.length > MAX_CHECKLIST_ITEM_LENGTH) {
      return 'habits.form.checklistItemTooLong'
    }
  }

  return null
}

export function validateDaysSelection(
  frequencyUnit: string | null | undefined,
  frequencyQuantity: number | null | undefined,
  days: string[],
  isGeneral: boolean,
  isFlexible: boolean,
): string | null {
  if (isGeneral || isFlexible || days.length === 0) return null
  if (frequencyUnit !== 'Day' || frequencyQuantity !== 1) {
    return 'habits.form.daysOnlyForDaily'
  }
  return null
}

/**
 * Validate scheduled reminder times (HH:MM format, no duplicates).
 */
export function validateScheduledReminders(
  scheduledReminders: { when: string; time: string }[],
): string | null {
  if (scheduledReminders.length === 0) return null
  if (scheduledReminders.length > MAX_SCHEDULED_REMINDERS) {
    return 'habits.form.scheduledReminderMax'
  }
  for (const sr of scheduledReminders) {
    if (validateTime(sr.time)) {
      return 'habits.form.invalidScheduledReminderTime'
    }
  }
  const keys = scheduledReminders.map(sr => `${sr.when}:${sr.time}`)
  if (new Set(keys).size !== keys.length) {
    return 'habits.form.duplicateScheduledReminder'
  }
  return null
}

/**
 * Validate the "minutes before due time" reminder offsets.
 * Must be integers in the range [0, 1440] and unique.
 */
export function validateReminderTimes(reminderTimes: number[]): string | null {
  if (reminderTimes.length === 0) return null
  for (const minutes of reminderTimes) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      return 'habits.form.reminderMinutesInvalid'
    }
  }
  if (new Set(reminderTimes).size !== reminderTimes.length) {
    return 'habits.form.reminderMinutesDuplicate'
  }
  return null
}

/**
 * Validate that dueEndTime requires a corresponding dueTime (can't have an end
 * without a start).
 */
export function validateDueTimes(dueTime: string, dueEndTime: string): string | null {
  if (dueEndTime && !dueTime) {
    return 'habits.form.dueEndTimeWithoutStart'
  }
  return null
}

export function validateReminderSelection(
  reminderEnabled: boolean,
  dueTime: string,
  reminderTimes: number[],
  scheduledReminders: { when: string; time: string }[],
): string | null {
  if (!reminderEnabled) return null

  if (dueTime) {
    if (reminderTimes.length === 0) {
      return 'habits.form.reminderMinimumOne'
    }
    const minutesErr = validateReminderTimes(reminderTimes)
    if (minutesErr) return minutesErr
    return null
  }

  if (scheduledReminders.length === 0) {
    return 'habits.form.reminderMinimumOne'
  }

  return validateScheduledReminders(scheduledReminders)
}

export function validateSubHabits(subHabits: string[]): string | null {
  if (subHabits.length > MAX_SUB_HABITS) {
    return 'habits.form.subHabitLimit'
  }

  for (const subHabit of subHabits) {
    const trimmed = subHabit.trim()
    if (!trimmed) {
      return 'habits.form.subHabitTitleRequired'
    }
    if (trimmed.length > MAX_HABIT_TITLE_LENGTH) {
      return 'habits.form.subHabitTitleTooLong'
    }
  }

  return null
}

export function validateGoalSelection(goalIds: string[]): string | null {
  if (goalIds.length > MAX_GOALS_PER_HABIT) {
    return 'habits.form.goalLimit'
  }
  return null
}

export function validateTagSelection(tagIds: string[]): string | null {
  if (tagIds.length > MAX_TAGS_PER_HABIT) {
    return 'habits.form.tagLimit'
  }
  return null
}

/**
 * Run all habit form validations. Returns the first error i18n key or null.
 */
export function validateHabitForm(data: HabitFormData): string | null {
  if (!data.title.trim()) {
    return 'habits.form.titleRequired'
  }
  if (data.title.trim().length > MAX_HABIT_TITLE_LENGTH) {
    return 'habits.form.titleTooLong'
  }

  const descriptionErr = validateDescription(data.description)
  if (descriptionErr) return descriptionErr

  const iconErr = validateHabitIcon(data.icon)
  if (iconErr) return iconErr

  const checklistErr = validateChecklistItems(data.checklistItems)
  if (checklistErr) return checklistErr

  const freqErr = validateFrequency(
    data.frequencyUnit,
    data.frequencyQuantity,
    data.isGeneral,
    data.isFlexible,
  )
  if (freqErr) return freqErr

  const daysErr = validateDaysSelection(
    data.frequencyUnit,
    data.frequencyQuantity,
    data.days,
    data.isGeneral,
    data.isFlexible,
  )
  if (daysErr) return daysErr

  if (data.isGeneral && data.isBadHabit) {
    return 'habits.form.generalBadHabit'
  }

  const endDateErr = validateEndDate(data.dueDate, data.endDate)
  if (endDateErr) return endDateErr

  const timeErr = validateTime(data.dueTime)
  if (timeErr) return timeErr

  const endTimeValidation = validateTime(data.dueEndTime)
  if (endTimeValidation) return endTimeValidation

  const dueTimesErr = validateDueTimes(data.dueTime, data.dueEndTime)
  if (dueTimesErr) return dueTimesErr

  const endTimeErr = validateEndTime(data.dueTime, data.dueEndTime)
  if (endTimeErr) return endTimeErr

  if (data.reminderEnabled) {
    const scheduledErr = validateScheduledReminders(data.scheduledReminders)
    if (scheduledErr) return scheduledErr
  }

  return null
}
