import { capitalizeFirstLetter, formatLocaleDate } from './locale-format'

export const CALENDAR_MONTH_GRID_GEOMETRY = {
  columns: 7,
  maximumRows: 6,
  cell: 44,
  gap: 4,
} as const

export type CalendarMonthDisplayState = 'loading' | 'empty' | 'future' | 'ready'

interface CalendarMonthDisplayStateInput {
  currentMonth: Date
  today: string
  hasEntries: boolean
  isLoading: boolean
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function resolveCalendarMonthDisplayState({
  currentMonth,
  today,
  hasEntries,
  isLoading,
}: Readonly<CalendarMonthDisplayStateInput>): CalendarMonthDisplayState {
  if (isLoading) return 'loading'
  if (monthKey(currentMonth) > today.slice(0, 7)) return 'future'
  return hasEntries ? 'ready' : 'empty'
}

export function formatCalendarMonthHeading(month: Date, todayKey: string, locale: string): { month: string; year: string | undefined } {
  const isCurrentYear = month.getFullYear() === Number(todayKey.slice(0, 4))
  const label = formatLocaleDate(month, locale, { month: isCurrentYear ? 'long' : 'short' })
  return { month: isCurrentYear ? capitalizeFirstLetter(label) : label, year: isCurrentYear ? undefined : String(month.getFullYear()) }
}

export function formatCalendarWeekLabel(start: Date, end: Date, locale: string): string {
  const startLabel = formatLocaleDate(start, locale, { day: 'numeric', month: 'short' })
  const endLabel = formatLocaleDate(end, locale, { day: 'numeric', ...(start.getMonth() === end.getMonth() ? {} : { month: 'short' }) })
  return `${startLabel} - ${endLabel}`
}
