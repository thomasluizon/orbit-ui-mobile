import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { MONTH_GRID_TARGET_MIN } from '../theme/breakpoints'
import { capitalizeFirstLetter, formatLocaleDate } from './locale-format'

export const CALENDAR_MONTH_GRID_GEOMETRY = {
  columns: 7,
  maximumRows: 6,
  cell: MONTH_GRID_TARGET_MIN,
  gap: 4,
  inlineInset: 16,
} as const

export const CALENDAR_GRID_GAP_CONTENT_BREAKPOINT =
  CALENDAR_MONTH_GRID_GEOMETRY.columns * CALENDAR_MONTH_GRID_GEOMETRY.cell
  + (CALENDAR_MONTH_GRID_GEOMETRY.columns - 1) * CALENDAR_MONTH_GRID_GEOMETRY.gap

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
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS
  const pattern = locale === 'pt-BR' ? 'd MMM' : 'MMM d'
  const startLabel = format(start, pattern, { locale: dateLocale })
  const endLabel = format(end, start.getMonth() === end.getMonth() ? 'd' : pattern, { locale: dateLocale })
  return `${startLabel} - ${endLabel}`
}
