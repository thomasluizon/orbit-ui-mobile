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
  slip_alert_enabled: ['stopSlipAlerts', 'sendSlipAlerts'],
  is_read_only: ['allowWrites', 'readOnly'], release_other_account: ['keepDeviceAccount', 'releaseDeviceAccount'],
  uses_24_hour_clock: ['clock12', 'clock24'],
}

export function summarizePendingOperationItem(
  fields: readonly PendingOperationChange[],
  translate: (key: string, values?: Record<string, string | number>) => string,
  formatTime: (value: string) => string,
  locale: string,
  actionKey?: string | null,
  today?: string,
): string {
  const reschedule = actionKey === 'rescheduleHabits' ? summarizeReschedule(fields, translate, locale, today) : undefined
  if (reschedule) return reschedule
  const changed = fields.filter(field => field.oldValue !== field.newValue && !['habit_id', 'title', 'emoji'].includes(field.field))
  if (['updateHabit', 'updateHabits'].includes(actionKey ?? '') && changed.length) {
    return summarizeHabitUpdate(fields, changed, translate, formatTime, locale)
  }
  const value = (name: string) => fields.find((field) => field.field === name)?.newValue
  const action = fields.find((field) => field.valueType === 'action')
  if (action && ['delete', 'dismiss_import', 'run_sync'].includes(action.field)) return translate(`chat.operation.field.${action.field}`)
  const creating = isHabitCreate(fields, actionKey)
  const cadence = cadenceSummary(fields, translate, actionKey)
  const intervalLabel = weekIntervalSummary(value('interval_weeks'), translate, creating && cadence.label != null)
  const date = value('due_date') ?? value('date')
  const dateLabel = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatLocaleDate(parseAPIDate(date), locale, { dateStyle: 'medium' }) : null
  const time = value('due_time')
  const summary = [cadence.label, intervalLabel, dateLabel, time ? translate('chat.preview.atTime', { time: formatTime(time) }) : null, ...additionalChanges(fields, translate, formatTime, locale, cadence.complete, creating), creating ? createReminderSummary(fields, translate, formatTime) : null].filter(Boolean).join(' · ')
  return summary || (actionKey && PREVIEW_ACTION_KEYS.includes(actionKey) ? translate(`chat.operation.source.${actionKey}`) : '')
}

function summarizeReschedule(fields: readonly PendingOperationChange[], translate: PreviewTranslation, locale: string, today?: string): string | undefined {
  const date = fields.find(field => field.field === 'due_date')
  if (!date?.newValue) return undefined
  if (date.oldValue !== date.newValue) {
    const change = compactDateChange([date], translate, locale, today)
    if (change) return change
  }
  return date.newValue === today ? translate('dates.today') : formatLocaleDate(parseAPIDate(date.newValue), locale, { dateStyle: 'medium' })
}

function summarizeHabitUpdate(
  fields: readonly PendingOperationChange[], changed: readonly PendingOperationChange[],
  translate: PreviewTranslation, formatTime: (value: string) => string, locale: string,
): string {
  const dateChange = compactDateChange(changed, translate, locale)
  if (dateChange) return dateChange
  const changedSchedule = changed.some(field => ['frequency_unit', 'frequency_quantity', 'days', 'due_date', 'due_time', 'is_general', 'is_flexible'].includes(field.field))
  const summarizedFields = changedSchedule ? fields.filter(field => !['habit_id', 'title', 'emoji'].includes(field.field) && (field.field !== 'is_bad_habit' || changed.includes(field))) : changed
  const before = summarizePendingOperationItem(summarizedFields.map(field => ({ ...field, oldValue: field.oldValue, newValue: field.oldValue ?? field.newValue, proposedValue: field.oldValue ?? field.proposedValue })), translate, formatTime, locale, 'scheduleDiff')
  const after = summarizePendingOperationItem(summarizedFields, translate, formatTime, locale, 'scheduleDiff')
  return before === after ? after : translate('chat.preview.beforeAfter', { before, after })
}

function compactDateChange(fields: readonly PendingOperationChange[], translate: PreviewTranslation, locale: string, today?: string): string | undefined {
  const field = fields[0]
  if (fields.length !== 1 || !field || !['due_date', 'date'].includes(field.field)
    || !field.oldValue || !field.newValue || !/^\d{4}-\d{2}-\d{2}$/.test(field.oldValue) || !/^\d{4}-\d{2}-\d{2}$/.test(field.newValue)) return undefined
  const sameYear = field.oldValue.slice(0, 4) === field.newValue.slice(0, 4)
  return translate('chat.preview.beforeAfter', {
    before: field.oldValue === today ? translate('dates.today') : formatLocaleDate(parseAPIDate(field.oldValue), locale, { day: 'numeric', month: 'numeric', ...(!sameYear ? { year: '2-digit' } as const : {}) }),
    after: field.newValue === today ? translate('dates.today') : formatLocaleDate(parseAPIDate(field.newValue), locale, { day: 'numeric', month: 'numeric', year: '2-digit' }),
  })
}

function weekIntervalSummary(value: string | null | undefined, translate: PreviewTranslation, omitDefault: boolean): string | null {
  const interval = Number(value)
  return value != null && interval >= (omitDefault ? 2 : 1)
    ? computeHabitFrequencyLabel({ isGeneral: false, frequencyUnit: 'Week', frequencyQuantity: interval, days: [], isFlexible: false }, (key, values) => translate(key, values as Record<string, string | number>)) : null
}

function isHabitCreate(fields: readonly PendingOperationChange[], actionKey?: string | null): boolean {
  return ['createHabit', 'createHabits', 'createSubHabit'].includes(actionKey ?? '')
    && !fields.some((field) => field.field === 'habit_id' || field.oldValue != null)
}

function cadenceSummary(fields: readonly PendingOperationChange[], translate: PreviewTranslation, actionKey?: string | null): { label: string | null; complete: boolean } {
  const value = (name: string) => fields.find((field) => field.field === name)?.newValue
  const unit = frequencyUnitSchema.safeParse(value('frequency_unit'))
  if (value('is_general')?.toLowerCase() === 'true') return { label: translate('chat.preview.summary.anytime'), complete: true }
  if (!unit.success) return { label: null, complete: false }
  const updating = fields.some((field) => field.oldValue != null || field.field === 'habit_id')
    || ['updateHabit', 'updateHabits'].includes(actionKey ?? '')
  const daysField = fields.find((field) => field.field === 'days')
  const flexible = value('is_flexible')?.toLowerCase()
  const complete = !updating || (value('frequency_quantity') != null
    && (flexible === 'true' || (flexible === 'false' && daysField != null)))
  if (!complete) return {
    label: value('frequency_quantity') != null ? translate(`chat.preview.interval.${unit.data}`, { count: Number(value('frequency_quantity')) }) : translate(`chat.preview.summary.${({ Day: 'repeatInDays', Week: 'repeatInWeeks', Month: 'repeatInMonths', Year: 'repeatInYears' } as const)[unit.data]}`),
    complete: false,
  }
  const days = Array.isArray(daysField?.proposedValue)
    ? daysField.proposedValue.filter((day): day is string => typeof day === 'string' && PENDING_OPERATION_WEEKDAYS.some((name) => name === day))
    : (value('days') ?? '').split(',').map((day) => day.trim()).filter((day) => PENDING_OPERATION_WEEKDAYS.some((name) => name === day))
  return { label: computeHabitFrequencyLabel({
    isGeneral: false, frequencyUnit: unit.data,
    frequencyQuantity: value('frequency_quantity') == null ? 1 : Number(value('frequency_quantity')),
    days, isFlexible: flexible === 'true',
  }, (key, values) => translate(key, values as Record<string, string | number>)), complete: true }
}

function createChange(field: PendingOperationChange, translate: PreviewTranslation): string[] | undefined {
  if (field.field === 'is_bad_habit' && field.newValue?.toLowerCase() === 'true') return [translate('chat.preview.summary.habitToAvoid')]
  if (['is_bad_habit', 'is_general', 'is_flexible', 'reminder_enabled', 'parent_id', 'new_parent_id', 'frequency_quantity'].includes(field.field)) return []
  if (field.field === 'parent_habit_id' && !field.newValue) return []
  if (field.field === 'sub_habits' || field.proposedValue === null || field.newValue == null || field.newValue === '' || field.newValue.toLowerCase() === 'false' || (Array.isArray(field.proposedValue) && field.proposedValue.length === 0)) return []
  if (field.field === 'tag_names' && Array.isArray(field.proposedValue)) return [field.proposedValue.filter((tag): tag is string => typeof tag === 'string').join(', ')]
  return undefined
}

function booleanChange(field: PendingOperationChange, translate: PreviewTranslation, scheduleSummarized: boolean): string[] | undefined {
  const keyPair = BOOLEAN_OUTCOMES[field.field]
  const boolean = field.newValue?.toLowerCase()
  if (!keyPair || (boolean !== 'true' && boolean !== 'false')) return undefined
  if (scheduleSummarized && ['is_general', 'is_flexible'].includes(field.field)) return []
  return [translate(`chat.preview.summary.${keyPair[boolean === 'true' ? 1 : 0]}`)]
}

function additionalChanges(
  fields: readonly PendingOperationChange[], translate: PreviewTranslation,
  formatTime: (value: string) => string, locale: string, scheduleSummarized: boolean, creating: boolean,
): string[] {
  return fields.flatMap((field) => {
    if (creating && ['reminder_enabled', 'reminder_times', 'scheduled_reminders'].includes(field.field)) return []
    const createOutcome = creating ? createChange(field, translate) : undefined
    if (createOutcome) return createOutcome
    const booleanOutcome = booleanChange(field, translate, scheduleSummarized)
    if (booleanOutcome) return booleanOutcome
    if (field.field === 'description') return [field.newValue || translate('chat.preview.summary.removeDescription')]
    if (field.field === 'emoji') return field.newValue ? [] : [translate('chat.preview.summary.removeIcon')]
    if (field.field === 'frequency_quantity') return []
    if (field.field === 'frequency_unit' && !field.newValue) return [translate('habits.filter.oneTime')]
    return [...scheduleAndListChanges(field, translate, formatTime, locale, scheduleSummarized), ...writeOutcome(field, translate, formatTime, locale)]
  })
}

function scheduleAndListChanges(field: PendingOperationChange, translate: PreviewTranslation, formatTime: (value: string) => string, locale: string, hasCadence: boolean): string[] {
  if (field.field === 'days' && !hasCadence) return [weekdaySummary(field, translate)]
  if (['due_date', 'date', 'due_time'].includes(field.field) && !field.newValue) return [translate(`chat.preview.summary.${field.field === 'due_time' ? 'removeTime' : 'removeDate'}`)]
  if (field.field === 'end_date') return [field.newValue ? translate('chat.preview.summary.endsOn', { date: formatLocaleDate(parseAPIDate(field.newValue), locale, { dateStyle: 'medium' }) }) : translate('chat.preview.summary.removeEndDate')]
  if (['checklist_items', 'sub_habits', 'reminder_times', 'scheduled_reminders'].includes(field.field)) return [listSummary(field, translate, formatTime)]
  return []
}

function createReminderSummary(fields: readonly PendingOperationChange[], translate: PreviewTranslation, formatTime: (value: string) => string): string | null {
  if (fields.find(field => field.field === 'reminder_enabled')?.newValue?.toLowerCase() !== 'true') return null
  const reminders = fields.filter(field => ['reminder_times', 'scheduled_reminders'].includes(field.field)
    && Array.isArray(field.proposedValue) && field.proposedValue.length > 0)
    .map(field => listSummary(field, translate, formatTime)).filter(Boolean)
  return reminders.join(', ') || translate('chat.preview.summary.sendReminders')
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

export const PREVIEW_ACTION_KEYS: readonly string[] = [
  'deleteHabit', 'updateHabits', 'rescheduleHabits', 'logHabits', 'skipHabits', 'createHabits', 'deleteHabits',
  'deleteGoal', 'deleteTag', 'deleteNotification', 'deleteAllNotifications', 'deleteNotifications',
  'setCalendarSync', 'dismissCalendarImport', 'dismissCalendarSuggestion', 'syncCalendar', 'manageCalendarSync',
  'deleteUserFacts', 'updateHabitEmojis', 'createHabit', 'createSubHabit', 'updateHabit', 'duplicateHabit',
  'moveHabit', 'moveHabitParent', 'reorderHabits', 'logHabit', 'skipHabit', 'updateChecklist',
  'createGoal', 'updateGoal', 'updateGoalProgress', 'updateGoalStatus', 'reorderGoals', 'linkGoalsToHabit',
  'linkHabitsToGoal', 'createTag', 'updateTag', 'assignTags', 'createChecklistTemplate', 'deleteChecklistTemplate',
  'updateProfilePreferences', 'setAiMemory', 'setAiSummary', 'setProactiveAstra', 'markNotificationRead', 'markAllNotificationsRead',
  'subscribePush', 'unsubscribePush', 'sendTestPush', 'updateNotifications', 'viewReferralCode',
  'sendSupportRequest', 'createCheckout', 'openBillingPortal', 'manageSubscription', 'viewApiKeys',
  'createApiKey', 'revokeApiKey', 'manageApiKeys', 'resetAccount', 'requestAccountDeletion', 'confirmAccountDeletion', 'manageAccount',
]

function writeOutcome(field: PendingOperationChange, translate: PreviewTranslation, formatTime: (value: string) => string, locale: string): string[] {
  const text = field.newValue
  if (['note', 'subject', 'message', 'email', 'text', 'summary'].includes(field.field) && text) return [text]
  if (['parent_id', 'new_parent_id'].includes(field.field)) return [translate(`chat.preview.summary.${text ? 'moveUnderHabit' : 'moveToTop'}`)]
  if (field.field === 'parent_habit_id') return [field.proposedValue === null ? translate('habits.moveParent.toRoot') : text ?? '']
  if (field.field === 'color' && text) return [translate('chat.preview.summary.tagColor', { color: text })]
  if (field.field === 'action' && text) return actionOutcome(text, translate)
  return [...goalOutcome(field, translate), ...collectionOutcome(field, translate), ...preferenceOutcome(field, translate), ...dateOutcome(field, translate, formatTime, locale)]
}

function goalOutcome(field: PendingOperationChange, translate: PreviewTranslation): string[] {
  const text = field.newValue
  if (field.field === 'status') {
    const key = ({ Active: 'reactivate', Completed: 'markCompleted', Abandoned: 'markAbandoned' } as Record<string, string>)[text ?? '']
    return key ? [translate(`goals.detail.${key}`)] : []
  }
  const numericKey = ({ current_value: 'progress', target_value: 'target' } as Record<string, string>)[field.field]
  if (numericKey && text != null) return [translate(`chat.preview.summary.${numericKey}`, { value: text })]
  if (field.field === 'unit' && text) return [translate('chat.preview.summary.unit', { unit: text })]
  if (field.field === 'goal_type' && (text === 'Standard' || text === 'Streak')) return [translate(`goals.form.type${text}`)]
  return []
}

function dateOutcome(field: PendingOperationChange, translate: PreviewTranslation, formatTime: (value: string) => string, locale: string): string[] {
  const text = field.newValue
  if (field.field === 'deadline') return [text ? translate('chat.preview.summary.deadline', { date: formatLocaleDate(parseAPIDate(text), locale, { dateStyle: 'medium' }) }) : translate('chat.preview.summary.clearDeadline')]
  if (field.field === 'due_end_time') return [text ? translate('chat.preview.summary.untilTime', { time: formatTime(text) }) : translate('chat.preview.summary.removeEndTime')]
  if (field.field === 'expires_at_utc') return [text ? translate('chat.preview.summary.expires', { date: formatLocaleDate(text, locale, { dateStyle: 'medium', timeStyle: 'short' }) }) : translate('chat.preview.summary.noExpiry')]
  return []
}

function collectionOutcome(field: PendingOperationChange, translate: PreviewTranslation): string[] {
  if (!Array.isArray(field.proposedValue)) return []
  const rows: unknown[] = field.proposedValue
  if (field.field === 'tag_names') return [translate('chat.preview.summary.replaceTags', { names: rows.filter((row): row is string => typeof row === 'string').join(', ') })]
  const countKey = ({ tag_ids: 'selectedTags', goal_ids: 'linkedGoals', habit_ids: 'linkedHabits', positions: 'reorderItems' } as Record<string, string>)[field.field]
  const clearKey = ({ tag_ids: 'clearTags', goal_ids: 'clearGoals', habit_ids: 'clearHabits' } as Record<string, string>)[field.field]
  if (field.field === 'tag_ids' && rows.length === 1) return [translate('chat.preview.summary.selectedTag')]
  if (countKey) return [translate(`chat.preview.summary.${!rows.length && clearKey ? clearKey : countKey}`, { count: rows.length })]
  if (field.field === 'items') return [rows.length ? rows.filter((row): row is string => typeof row === 'string').join(', ') : translate('chat.preview.summary.clearChecklist')]
  return []
}

function actionOutcome(action: string, translate: PreviewTranslation): string[] {
  const keys: Readonly<Record<string, string>> = {
    mark_read: 'markNotificationRead', mark_all_read: 'markAllNotificationsRead', subscribe_push: 'subscribePush',
    unsubscribe_push: 'unsubscribePush', test_push: 'sendTestPush', create_checkout: 'createCheckout',
    create_portal: 'openBillingPortal', create: 'createApiKey', revoke: 'revokeApiKey', reset_account: 'resetAccount',
    request_deletion: 'requestAccountDeletion', confirm_deletion: 'confirmAccountDeletion',
    complete_onboarding: 'completeOnboarding', complete_tour: 'completeTour', reset_tour: 'resetTour',
  }
  return keys[action] ? [translate(`chat.operation.source.${keys[action]}`)] : []
}

function preferenceOutcome(field: PendingOperationChange, translate: PreviewTranslation): string[] {
  const text = field.newValue
  if (field.field === 'timezone' && text) return [translate('profile.settingsRows.timezoneValue', { timeZone: text })]
  if (field.field === 'language' && (text === 'en' || text === 'pt-BR')) return [translate('chat.preview.summary.language', { language: translate(`chat.account.value.language.${text}`) })]
  if (field.field === 'week_start_day' && (text === '0' || text === '1')) return [translate('chat.preview.summary.weekStart', { day: translate(`chat.account.value.weekStartDay.${text}`) })]
  if (field.field === 'theme_preference') return [translate('chat.preview.summary.theme', { theme: text === 'dark' || text === 'light' ? translate(`chat.account.value.themePreference.${text}`) : translate('chat.preview.summary.systemTheme') })]
  if (field.field === 'interval' && (text === 'monthly' || text === 'yearly')) return [translate('chat.account.value.interval.' + text)]
  if (field.field === 'scopes' && Array.isArray(field.proposedValue)) return [translate('chat.preview.summary.permissions', { count: field.proposedValue.length })]
  return []
}
