import type { HabitFormData } from '../validation/habit-form'
import { formatHabitReminderLabel } from './habit-form-helpers'

type TranslateTiming = (key: string, values?: Record<string, string | number>) => string

export function buildHabitTimingSummary(values: Partial<HabitFormData>, offsets: number[], displayTime: (time: string) => string, translate: TranslateTiming): string {
  const parts: string[] = []
  if (values.dueTime && !values.isGeneral) parts.push(displayTime(values.dueTime))
  if (values.reminderEnabled) {
    const repeat = values.repeatReminder
    if (repeat) {
      const interval = repeat.intervalMinutes < 60
        ? translate('habits.form.repeatMinutes', { count: repeat.intervalMinutes })
        : translate('habits.form.repeatHours', { count: repeat.intervalMinutes / 60 })
      parts.push(translate('habits.form.repeatSummary', { interval }))
    } else if (!values.isGeneral) {
      if (values.dueTime) parts.push(...offsets.map((minutes) => formatHabitReminderLabel(minutes, translate)))
      parts.push(...(values.scheduledReminders ?? []).map((reminder) => translate(reminder.when === 'day_before' ? 'habits.form.scheduledReminderDayBeforeAt' : 'habits.form.scheduledReminderSameDayAt', { time: displayTime(reminder.time) })))
    }
  }
  return parts.length ? parts.join(', ') : translate('habits.form.timingEmpty')
}
