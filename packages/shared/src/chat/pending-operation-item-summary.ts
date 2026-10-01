import type { PendingOperationChange } from '../types/ai'
import { frequencyUnitSchema } from '../types/habit'
import { computeHabitFrequencyLabel } from '../utils/habit-card-helpers'
import { formatHabitReminderLabel } from '../utils/habit-form-helpers'
import { parseAPIDate } from '../utils/dates'
import { formatLocaleDate } from '../utils/locale-format'

export const PENDING_OPERATION_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

type PreviewTranslation = (key: string, values?: Record<string, string | number>) => string

const BOOLEAN_OUTCOMES: Readonly<Record<string, readonly [string, string]>> = {
  reminder_enabled: ['stopReminders', 'sendReminders'], enabled: ['turnOff', 'turnOn'],
  is_completed: ['keepOpen', 'complete'], is_bad_habit: ['buildHabit', 'reduceHabit'],
  is_general: ['onSchedule', 'anytime'], is_flexible: ['fixedDays', 'anyDay'],
}

export function summarizePendingOperationItem(
  fields: readonly PendingOperationChange[],
  translate: (key: string, values?: Record<string, string | number>) => string,
  formatTime: (value: string) => string,
  locale: string,
): string {
  const value = (name: string) => fields.find((field) => field.field === name)?.newValue
  const action = fields.find((field) => field.valueType === 'action')
  if (action && ['delete', 'dismiss_import', 'run_sync'].includes(action.field)) return translate(`chat.operation.field.${action.field}`)
  const cadence = cadenceSummary(fields, translate)
  const interval = Number(value('interval_weeks'))
  const intervalLabel = value('interval_weeks') != null && interval >= 1 ? computeHabitFrequencyLabel({ isGeneral: false, frequencyUnit: 'Week', frequencyQuantity: interval, days: [], isFlexible: false }, (key, values) => translate(key, values as Record<string, string | number>)) : null
  const date = value('due_date') ?? value('date')
  const dateLabel = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatLocaleDate(parseAPIDate(date), locale, { dateStyle: 'medium' }) : null
  const time = value('due_time')
  return [cadence, intervalLabel, dateLabel, time ? translate('chat.preview.atTime', { time: formatTime(time) }) : null, ...additionalChanges(fields, translate, formatTime, locale, Boolean(cadence))].filter(Boolean).join(' · ')
}

function cadenceSummary(fields: readonly PendingOperationChange[], translate: PreviewTranslation): string | null {
  const value = (name: string) => fields.find((field) => field.field === name)?.newValue
  const unit = frequencyUnitSchema.safeParse(value('frequency_unit'))
  const unitChange = fields.find((field) => field.field === 'frequency_unit')
  const unitOnlyUpdate = unitChange?.oldValue != null && value('frequency_quantity') == null
  const daysField = fields.find((field) => field.field === 'days')
  const days = Array.isArray(daysField?.proposedValue)
    ? daysField.proposedValue.filter((day): day is string => typeof day === 'string' && PENDING_OPERATION_WEEKDAYS.some((name) => name === day))
    : (value('days') ?? '').split(',').map((day) => day.trim()).filter((day) => PENDING_OPERATION_WEEKDAYS.some((name) => name === day))
  return unit.success && unitOnlyUpdate
    ? translate(`habits.filter.${({ Day: 'daily', Week: 'weekly', Month: 'monthly', Year: 'yearly' } as const)[unit.data]}`)
    : unit.success ? computeHabitFrequencyLabel({
    isGeneral: value('is_general')?.toLowerCase() === 'true',
    frequencyUnit: unit.data,
    frequencyQuantity: value('frequency_quantity') == null ? 1 : Number(value('frequency_quantity')),
    days,
    isFlexible: value('is_flexible')?.toLowerCase() === 'true',
  }, (key, values) => translate(key, values as Record<string, string | number>)) : null
}

function additionalChanges(
  fields: readonly PendingOperationChange[], translate: PreviewTranslation,
  formatTime: (value: string) => string, locale: string, hasCadence: boolean,
): string[] {
  return fields.flatMap((field) => {
    const keyPair = BOOLEAN_OUTCOMES[field.field]
    const boolean = field.newValue?.toLowerCase()
    if (keyPair && (boolean === 'true' || boolean === 'false')) {
      if (hasCadence && ['is_general', 'is_flexible'].includes(field.field)) return []
      return [translate(`chat.preview.summary.${keyPair[boolean === 'true' ? 1 : 0]}`)]
    }
    if (field.field === 'description') return [field.newValue || translate('chat.preview.summary.removeDescription')]
    if (field.field === 'emoji') return field.newValue ? [translate('chat.preview.summary.useIcon', { emoji: field.newValue })] : [translate('chat.preview.summary.removeIcon')]
    if (field.field === 'frequency_quantity' && !hasCadence && field.newValue) return [translate('chat.preview.summary.repeatInterval', { count: field.newValue })]
    if (field.field === 'frequency_unit' && !field.newValue) return [translate('habits.filter.oneTime')]
    return scheduleAndListChanges(field, translate, formatTime, locale, hasCadence)
  })
}

function scheduleAndListChanges(field: PendingOperationChange, translate: PreviewTranslation, formatTime: (value: string) => string, locale: string, hasCadence: boolean): string[] {
  if (field.field === 'days' && !hasCadence) return [weekdaySummary(field, translate)]
  if (['due_date', 'date', 'due_time'].includes(field.field) && !field.newValue) return [translate(`chat.preview.summary.${field.field === 'due_time' ? 'removeTime' : 'removeDate'}`)]
  if (field.field === 'end_date') return [field.newValue ? translate('chat.preview.summary.endsOn', { date: formatLocaleDate(parseAPIDate(field.newValue), locale, { dateStyle: 'medium' }) }) : translate('chat.preview.summary.removeEndDate')]
  if (['checklist_items', 'sub_habits', 'reminder_times', 'scheduled_reminders'].includes(field.field)) return [listSummary(field, translate, formatTime)]
  return []
}

function weekdaySummary(field: PendingOperationChange, translate: PreviewTranslation): string {
  return PENDING_OPERATION_WEEKDAYS.filter((day) => Array.isArray(field.proposedValue) ? field.proposedValue.includes(day) : field.newValue?.split(',').some((name) => name.trim() === day)).map((day) => translate(`dates.daysShort.${day.toLowerCase()}`)).join(', ') || translate('chat.preview.summary.clearDays')
}

function listSummary(field: PendingOperationChange, translate: PreviewTranslation, formatTime: (value: string) => string): string {
  if (!Array.isArray(field.proposedValue)) return ''
  const rows: unknown[] = field.proposedValue
  if (!rows.length) return translate(`chat.preview.summary.${field.field === 'checklist_items' ? 'clearChecklist' : field.field === 'sub_habits' ? 'clearSubHabits' : 'clearReminders'}`)
  if (field.field === 'sub_habits') return translate('chat.preview.summary.subHabits', { count: rows.length })
  return rows.flatMap((row) => {
    if (field.field === 'reminder_times' && typeof row === 'number') return [translate('chat.preview.summary.remindWhen', { when: formatHabitReminderLabel(row, translate) })]
    if (typeof row !== 'object' || row === null) return typeof row === 'string' && field.field === 'checklist_items' ? [row] : []
    if (field.field === 'checklist_items' && 'text' in row && typeof row.text === 'string') return [row.text + ('is_checked' in row && row.is_checked === true ? ` (${translate('blockFrame.status.done')})` : '')]
    if (field.field === 'scheduled_reminders' && 'when' in row && 'time' in row && typeof row.time === 'string' && (row.when === 'same_day' || row.when === 'day_before')) return [translate(`chat.preview.summary.${row.when === 'same_day' ? 'remindSameDay' : 'remindDayBefore'}`, { time: formatTime(row.time) })]
    return []
  }).join(', ')
}
