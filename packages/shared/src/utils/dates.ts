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
