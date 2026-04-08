import type { BulkCreateRequest, FrequencyUnit } from '../types/habit'

export interface CalendarSyncEvent {
  id: string
  title: string
  description: string | null
  startDate: string | null
  startTime: string | null
  endTime: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  reminders: number[]
}

export interface CalendarSyncParsedRecurrence {
  frequencyUnit?: FrequencyUnit
  frequencyQuantity?: number
  days?: string[]
}

export interface CalendarSyncTranslationAdapter {
  translate: (key: string, values?: Record<string, unknown>) => string
  pluralize: (text: string, count: number) => string
}

const FREQUENCY_UNIT_MAP: Record<string, FrequencyUnit> = {
  DAILY: 'Day',
  WEEKLY: 'Week',
  MONTHLY: 'Month',
  YEARLY: 'Year',
}

const WEEKDAY_MAP: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
}

function parseRuleParts(rule: string): Record<string, string> {
  return Object.fromEntries(
    rule
      .replace('RRULE:', '')
      .split(';')
      .map((part) => {
        const [key, value] = part.split('=')
        return key ? [key, value ?? ''] as const : null
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function parseRecurrenceInterval(rule: string): number {
  const intervalMatch = /INTERVAL=(\d+)/.exec(rule)
  return intervalMatch?.[1] ? Number.parseInt(intervalMatch[1], 10) : 1
}

function formatIntervalRecurrence(
  interval: number,
  singularKey: string,
  pluralKey: string,
  translate: CalendarSyncTranslationAdapter['translate'],
  pluralize: CalendarSyncTranslationAdapter['pluralize'],
): string {
  if (interval <= 1) {
    return translate(singularKey)
  }

  return pluralize(translate(pluralKey, { n: interval }), interval)
}

function resolveRecurrenceQuantity(
  recurrence: CalendarSyncParsedRecurrence,
): number | null {
  if (!recurrence.frequencyUnit) return null
  if (recurrence.frequencyQuantity && recurrence.frequencyQuantity >= 1) {
    return recurrence.frequencyQuantity
  }

  return 1
}

function resolveRecurrenceType(rule: string): 'daily' | 'weekly' | 'monthly' | 'yearly' | null {
  if (rule.includes('FREQ=DAILY')) return 'daily'
  if (rule.includes('FREQ=WEEKLY')) return 'weekly'
  if (rule.includes('FREQ=MONTHLY')) return 'monthly'
  if (rule.includes('FREQ=YEARLY')) return 'yearly'
  return null
}

function formatWeeklyRecurrence(
  rule: string,
  interval: number,
  { translate, pluralize }: CalendarSyncTranslationAdapter,
): string {
  const dayMatch = /BYDAY=([A-Z,]+)/.exec(rule)
  const days = dayMatch ? dayMatch[1] : ''

  if (interval > 1) {
    const base = pluralize(translate('calendar.recurrenceEveryNWeeks', { n: interval }), interval)
    return days ? `${base} (${days})` : base
  }

  if (days) return translate('calendar.recurrenceWeeklyDays', { days })
  return translate('calendar.recurrenceWeekly')
}

export function parseCalendarSyncRecurrence(
  rule: string | null,
): CalendarSyncParsedRecurrence {
  if (!rule) return {}

  const parts = parseRuleParts(rule)
  const result: CalendarSyncParsedRecurrence = {}

  if (parts.FREQ && parts.FREQ in FREQUENCY_UNIT_MAP) {
    result.frequencyUnit = FREQUENCY_UNIT_MAP[parts.FREQ]
  }

  if (parts.INTERVAL) {
    const parsed = Number.parseInt(parts.INTERVAL, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      result.frequencyQuantity = parsed
    }
  } else if (result.frequencyUnit) {
    result.frequencyQuantity = 1
  }

  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',')
      .map((day) => WEEKDAY_MAP[day.trim()])
      .filter((day): day is string => !!day)

    if (days.length > 0) {
      result.days = days
    }
  }

  return result
}

export function formatCalendarSyncRecurrenceLabel(
  rule: string | null,
  translations: CalendarSyncTranslationAdapter,
): string {
  if (!rule) return ''

  const upper = rule.toUpperCase()
  const interval = parseRecurrenceInterval(upper)
  const recurrenceType = resolveRecurrenceType(upper)

  switch (recurrenceType) {
    case 'daily':
      return formatIntervalRecurrence(
        interval,
        'calendar.recurrenceDaily',
        'calendar.recurrenceEveryNDays',
        translations.translate,
        translations.pluralize,
      )
    case 'weekly':
      return formatWeeklyRecurrence(upper, interval, translations)
    case 'monthly':
      return formatIntervalRecurrence(
        interval,
        'calendar.recurrenceMonthly',
        'calendar.recurrenceEveryNMonths',
        translations.translate,
        translations.pluralize,
      )
    case 'yearly':
      return translations.translate('calendar.recurrenceYearly')
    default:
      return ''
  }
}

export function isCalendarSyncNotConnectedMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('not connected') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid authentication credentials') ||
    lower.includes('google calendar') ||
    lower.includes('calendar connection')
  )
}

export function buildCalendarSyncImportRequest(
  events: CalendarSyncEvent[],
): BulkCreateRequest {
  return {
    habits: events.map((event) => {
      const recurrence = parseCalendarSyncRecurrence(event.recurrenceRule)
      const quantity = resolveRecurrenceQuantity(recurrence)
      const days = quantity === 1 ? (recurrence.days ?? null) : null
      const reminderTimes = event.reminders.length > 0 ? event.reminders : null

      return {
        title: event.title,
        description: event.description,
        dueDate: event.startDate,
        dueTime: event.startTime,
        dueEndTime: event.endTime,
        frequencyUnit: recurrence.frequencyUnit ?? null,
        frequencyQuantity: quantity,
        days,
        reminderEnabled: event.reminders.length > 0,
        reminderTimes,
      }
    }),
  }
}
