import { REPEAT_REMINDER_INTERVALS } from '../utils/repeat-reminders'
import { z } from 'zod'
import { utf16Length } from './utf16-length'
import { repeatReminderOptionsSchema, frequencyUnitSchema, MAX_HABIT_INTERVAL_WEEKS, scheduledReminderTimeRequestSchema, checklistItemSchema } from '../types/habit'
import {
  MAX_CHECKLIST_ITEM_LENGTH,
  MAX_CHECKLIST_ITEMS,
  MAX_GOALS_PER_HABIT,
  MAX_HABIT_DESCRIPTION_LENGTH,
  MAX_HABIT_EMOJI_LENGTH,
  MAX_HABIT_TITLE_LENGTH,
  MAX_SCHEDULED_REMINDERS,
  MAX_SUB_HABITS,
  MAX_TAGS_PER_HABIT,
} from './constants'

function habitFormTextFields(task: boolean) {
  return {
    title: z
      .string()
      .trim()
      .check(utf16Length('min', 1, 'habits.form.titleRequired'))
      .check(utf16Length('max', MAX_HABIT_TITLE_LENGTH, task ? 'habits.form.taskTitleTooLong' : 'habits.form.titleTooLong')),
    description: z
      .string()
      .check(utf16Length('max', MAX_HABIT_DESCRIPTION_LENGTH, task ? 'habits.form.taskDescriptionTooLong' : 'habits.form.descriptionTooLong'))
      .optional()
      .default(''),
    emoji: z
      .string()
      .check(utf16Length('max', MAX_HABIT_EMOJI_LENGTH, task ? 'habits.form.taskEmojiTooLong' : 'habits.form.emojiTooLong'))
      .optional()
      .default(''),
  }
}

export const habitFormSchema = z.object({
  itemType: z.enum(['task', 'habit']).nullable().optional(),
  datePhrase: z.string().optional(),
  dateIssue: z.string().optional(),
  ...habitFormTextFields(false),
  frequencyUnit: frequencyUnitSchema.nullable().optional(),
  frequencyQuantity: z.number().int().min(1).nullable().optional(),
  intervalWeeks: z.number().int().min(1).max(MAX_HABIT_INTERVAL_WEEKS).optional(),
  days: z.array(z.string()).default([]),
  isBadHabit: z.boolean().default(false),
  isGeneral: z.boolean().default(false),
  isFlexible: z.boolean().default(false),
  dueDate: z.string().default(''),
  dueTime: z.string().default(''),
  dueEndTime: z.string().default(''),
  endDate: z.string().default(''),
  repeatReminder: repeatReminderOptionsSchema.nullish(),
  reminderEnabled: z.boolean().default(false),
  scheduledReminders: z.array(scheduledReminderTimeRequestSchema).default([]),
  slipAlertEnabled: z.boolean().default(false),
  checklistItems: z.array(checklistItemSchema).default([]),
})

const taskHabitFormSchema = habitFormSchema.extend(habitFormTextFields(true))

export function habitFormSchemaForType(itemType: 'task' | 'habit' | null | undefined): typeof habitFormSchema {
  return itemType === 'task' ? taskHabitFormSchema : habitFormSchema
}

export type HabitFormData = z.infer<typeof habitFormSchema>

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
  if (!dueEndTime) return null
  if (!dueTime) return 'habits.form.endTimeRequiresStart'
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

function validateDescription(description: string | undefined): string | null {
  if (!description) return null
  if (description.length > MAX_HABIT_DESCRIPTION_LENGTH) {
    return 'habits.form.descriptionTooLong'
  }
  return null
}

export function validateEmoji(emoji: string | undefined): string | null {
  if (!emoji) return null
  if (emoji.length > MAX_HABIT_EMOJI_LENGTH) {
    return 'habits.form.emojiTooLong'
  }
  return null
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

export function validateReminderSelection(
  reminderEnabled: boolean,
  dueTime: string,
  reminderTimes: number[],
  scheduledReminders: { when: string; time: string }[],
): string | null {
  if (!reminderEnabled) return null

  if (dueTime) {
    if (reminderTimes.length + scheduledReminders.length === 0) {
      return 'habits.form.reminderMinimumOne'
    }
    if (reminderTimes.length + scheduledReminders.length > 15) {
      return 'habits.form.relativeReminderMax'
    }
    if (reminderTimes.some((minutes) => !Number.isInteger(minutes) || minutes < -1439 || minutes > 10080)) {
      return 'habits.form.invalidRelativeReminder'
    }
    return validateScheduledReminders(scheduledReminders)
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

function validateTimes(data: HabitFormData): string | null {
  const timeErr = validateTime(data.dueTime)
  if (timeErr) return timeErr

  const endTimeValidation = validateTime(data.dueEndTime)
  if (endTimeValidation) return endTimeValidation

  return validateEndTime(data.dueTime, data.dueEndTime)
}

function validateHabitTextFields(data: HabitFormData): string | null {
  if (!data.title.trim()) {
    return 'habits.form.titleRequired'
  }
  if (data.title.trim().length > MAX_HABIT_TITLE_LENGTH) {
    return data.itemType === 'task' ? 'habits.form.taskTitleTooLong' : 'habits.form.titleTooLong'
  }

  const descriptionErr = validateDescription(data.description)
  if (descriptionErr) return data.itemType === 'task' ? 'habits.form.taskDescriptionTooLong' : descriptionErr

  const emojiErr = validateEmoji(data.emoji)
  if (emojiErr) return data.itemType === 'task' ? 'habits.form.taskEmojiTooLong' : emojiErr

  return null
}

/**
 * Run all habit form validations. Returns the first error i18n key or null.
 */
export function validateHabitForm(data: HabitFormData): string | null {
  const textError = validateHabitTextFields(data)
  if (textError) return textError

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

  const timeErr = validateTimes(data)
  if (timeErr) return timeErr

  return validateHabitReminders(data)
}

function validateHabitReminders(data: HabitFormData): string | null {
  if (!data.reminderEnabled) return null
  if (data.repeatReminder) return validateRepeatReminder(data)
  return validateScheduledReminders(data.scheduledReminders)
}

function validateRepeatReminder(data: HabitFormData): string | null {
  const repeat = data.repeatReminder
  if (!repeat) return null
  if (!REPEAT_REMINDER_INTERVALS.includes(repeat.intervalMinutes)
    || Boolean(repeat.activeStart) !== Boolean(repeat.activeEnd)
    || repeat.activeStart != null && (!repeat.activeStart || repeat.activeStart.slice(0, 5) === repeat.activeEnd?.slice(0, 5) || validateTime(repeat.activeStart.slice(0, 5)) !== null)
    || repeat.activeEnd != null && (!repeat.activeEnd || validateTime(repeat.activeEnd.slice(0, 5)) !== null)
    || repeat.startAtUtc != null && !Number.isFinite(Date.parse(repeat.startAtUtc))) return 'habits.form.repeatInvalid'
  return null
}
