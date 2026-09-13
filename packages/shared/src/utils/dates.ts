import { parse, format } from 'date-fns'

/**
 * Current instant. Single source for "now" so callers don't construct `new Date()` directly.
 */
export function nowDate(): Date {
  return new Date()
}

/**
 * Parse a date string from the API (YYYY-MM-DD format) as a local date.
 * NEVER use new Date(dateStr) directly - it parses as UTC and causes timezone bugs.
 * Throws a descriptive error when the input is not a valid YYYY-MM-DD date.
 */
export function parseAPIDate(dateStr: string): Date {
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date())
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`parseAPIDate: invalid YYYY-MM-DD date string "${dateStr}"`)
  }
  return parsed
}

/**
 * Format a Date object as an API-compatible date string (YYYY-MM-DD format).
 */
export function formatAPIDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export interface AccountDateTime {
  date: string
  minutes: number
}

/** Resolve an instant to the account calendar values used by the API. */
export function getAccountDateTime(date: Date, timeZone?: string | null): AccountDateTime {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return getAccountDateTime(date, 'UTC')
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  }
}

/** Format an instant as the calendar date used by an account's API timezone. */
export function formatAPIDateInTimeZone(date: Date, timeZone?: string | null): string {
  return getAccountDateTime(date, timeZone).date
}

export function resolveHabitDetailRouteDate(
  value: string | readonly string[] | null | undefined,
  today = new Date(),
): string {
  const fallback = formatAPIDate(today)
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  try {
    return formatAPIDate(parseAPIDate(value)) === value ? value : fallback
  } catch {
    return fallback
  }
}
