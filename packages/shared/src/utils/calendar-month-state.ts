export const CALENDAR_MONTH_GRID_GEOMETRY = {
  columns: 7,
  maximumRows: 6,
  cell: 44,
  gap: 4,
} as const

export const CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT =
  CALENDAR_MONTH_GRID_GEOMETRY.maximumRows * CALENDAR_MONTH_GRID_GEOMETRY.cell
  + (CALENDAR_MONTH_GRID_GEOMETRY.maximumRows - 1) * CALENDAR_MONTH_GRID_GEOMETRY.gap

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
