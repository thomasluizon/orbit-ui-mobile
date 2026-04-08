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
  { translate, pluralize }: CalendarSyncTranslationAdapter,
): string {
  if (!rule) return ''

  const upper = rule.toUpperCase()
  const intervalMatch = /INTERVAL=(\d+)/.exec(upper)
  const interval = intervalMatch?.[1] ? Number.parseInt(intervalMatch[1], 10) : 1

  if (upper.includes('FREQ=DAILY')) {
    return interval > 1
      ? pluralize(translate('calendar.recurrenceEveryNDays', { n: interval }), interval)
      : translate('calendar.recurrenceDaily')
  }

  if (upper.includes('FREQ=WEEKLY')) {
    const dayMatch = /BYDAY=([A-Z,]+)/.exec(upper)
    const days = dayMatch ? dayMatch[1] : ''

    if (interval > 1) {
      const base = pluralize(translate('calendar.recurrenceEveryNWeeks', { n: interval }), interval)
      return days ? `${base} (${days})` : base
    }

    if (days) return translate('calendar.recurrenceWeeklyDays', { days })
    return translate('calendar.recurrenceWeekly')
  }

  if (upper.includes('FREQ=MONTHLY')) {
    return interval > 1
      ? pluralize(translate('calendar.recurrenceEveryNMonths', { n: interval }), interval)
      : translate('calendar.recurrenceMonthly')
  }

  if (upper.includes('FREQ=YEARLY')) {
    return translate('calendar.recurrenceYearly')
  }

  return ''
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
      const hasRecurrence = !!recurrence.frequencyUnit
      const quantity = hasRecurrence
        ? recurrence.frequencyQuantity && recurrence.frequencyQuantity >= 1
          ? recurrence.frequencyQuantity
          : 1
        : null

      return {
        title: event.title,
        description: event.description,
        dueDate: event.startDate,
        dueTime: event.startTime,
        dueEndTime: event.endTime,
        frequencyUnit: recurrence.frequencyUnit ?? null,
        frequencyQuantity: quantity,
        days: quantity === 1 ? (recurrence.days ?? null) : null,
        reminderEnabled: event.reminders.length > 0,
        reminderTimes: event.reminders.length > 0 ? event.reminders : null,
      }
    }),
  }
}
