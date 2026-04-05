import { z } from 'zod'
import { frequencyUnitSchema, scheduledReminderTimeSchema, checklistItemSchema } from '../types/habit'

// --- Habit form schema ---

export const habitFormSchema = z.object({
  title: z.string().min(1, 'habits.form.titleRequired').trim(),
  description: z.string().optional().default(''),
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
  if (time?.length !== 5) return null
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

/**
 * Validate scheduled reminder times (HH:MM format, no duplicates).
 */
export function validateScheduledReminders(
  scheduledReminders: { when: string; time: string }[],
): string | null {
  if (scheduledReminders.length === 0) return null
  for (const sr of scheduledReminders) {
    if (sr.time.length === 5) {
      const parts = sr.time.split(':')
      const h = Number.parseInt(parts[0] ?? '', 10)
      const m = Number.parseInt(parts[1] ?? '', 10)
      if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return 'habits.form.invalidScheduledReminderTime'
      }
    }
  }
  const keys = scheduledReminders.map(sr => `${sr.when}:${sr.time}`)
  if (new Set(keys).size !== keys.length) {
    return 'habits.form.duplicateScheduledReminder'
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

  const freqErr = validateFrequency(
    data.frequencyUnit,
    data.frequencyQuantity,
    data.isGeneral,
    data.isFlexible,
  )
  if (freqErr) return freqErr

  const endDateErr = validateEndDate(data.dueDate, data.endDate)
  if (endDateErr) return endDateErr

  const timeErr = validateTime(data.dueTime)
  if (timeErr) return timeErr

  const endTimeValidation = validateTime(data.dueEndTime)
  if (endTimeValidation) return endTimeValidation

  const endTimeErr = validateEndTime(data.dueTime, data.dueEndTime)
  if (endTimeErr) return endTimeErr

  if (data.reminderEnabled) {
    const scheduledErr = validateScheduledReminders(data.scheduledReminders)
    if (scheduledErr) return scheduledErr
  }

  return null
}
