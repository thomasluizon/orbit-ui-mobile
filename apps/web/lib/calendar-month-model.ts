import { eachDayOfInterval, endOfMonth, startOfMonth } from 'date-fns'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

export interface CalendarMonthStats {
  bestStreak: number
  totalLogs: number
  missed: number
  hasEntries: boolean
}

export interface CalendarMonthModel {
  monthStats: CalendarMonthStats
}

/**
 * Computes the calendar month statistics (best streak, total logs, missed,
 * whether any entries exist) for the month containing `currentMonth`. Pure.
 */
export function buildCalendarMonthModel(
  currentMonth: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
): CalendarMonthModel {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  let totalLogs = 0
  let missed = 0
  let bestStreak = 0
  let currentStreak = 0
  let hasEntries = false

  for (const day of days) {
    const entries: CalendarDayEntry[] = dayMap.get(formatAPIDate(day)) ?? []
    if (entries.length > 0) hasEntries = true
    const completedCount = entries.filter((e) => e.status === 'completed').length
    totalLogs += completedCount
    missed += entries.filter((e) => e.status === 'missed').length

    if (entries.length > 0 && completedCount === entries.length) {
      currentStreak += 1
      if (currentStreak > bestStreak) bestStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }

  return { monthStats: { bestStreak, totalLogs, missed, hasEntries } }
}
