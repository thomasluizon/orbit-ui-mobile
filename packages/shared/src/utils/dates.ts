import { parse, format } from 'date-fns'

/**
 * Parse a date string from the API (YYYY-MM-DD format) as a local date.
 * NEVER use new Date(dateStr) directly - it parses as UTC and causes timezone bugs.
 */
export function parseAPIDate(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date())
}

/**
 * Format a Date object as an API-compatible date string (YYYY-MM-DD format).
 */
export function formatAPIDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
