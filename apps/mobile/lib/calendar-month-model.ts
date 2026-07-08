import {
  addDays,
  endOfMonth,
  endOfWeek,
  getDate,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { formatAPIDate } from "@orbit/shared/utils"
import type { CalendarDayEntry } from "@orbit/shared/types/calendar"
import type { GridDay } from "@/app/(tabs)/calendar/_components/calendar-grid"

export interface CalendarMonthStats {
  totalLogs: number
  missed: number
  bestStreak: number
  hasEntries: boolean
}

export interface CalendarMonthModel {
  gridDays: GridDay[]
  monthStats: CalendarMonthStats
}

/**
 * Builds the 6-week month grid and the derived month statistics for the
 * calendar month view. Pure — depends only on its inputs.
 */
export function buildCalendarMonthModel(
  currentMonth: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
  weekStartsOn: 0 | 1,
): CalendarMonthModel {
  const gridDays = buildMonthGridDays(currentMonth, dayMap, weekStartsOn)
  const monthStats = computeMonthStats(gridDays)
  return { gridDays, monthStats }
}

function buildMonthGridDays(
  currentMonth: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
  weekStartsOn: 0 | 1,
): GridDay[] {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn })

  const days: GridDay[] = []
  let day = gridStart
  while (day <= gridEnd) {
    const dateStr = formatAPIDate(day)
    const entries: CalendarDayEntry[] = dayMap.get(dateStr) ?? []
    const completedCount = entries.filter(
      (entry) => entry.status === "completed",
    ).length
    const totalCount = entries.length

    days.push({
      date: day,
      dateStr,
      day: getDate(day),
      isCurrentMonth: isSameMonth(day, currentMonth),
      isToday: isToday(day),
      entries,
      completedCount,
      totalCount,
      completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
    })
    day = addDays(day, 1)
  }

  return days
}

function computeMonthStats(gridDays: GridDay[]): CalendarMonthStats {
  const monthDays = gridDays.filter((d) => d.isCurrentMonth)
  const totalLogs = monthDays.reduce((acc, d) => acc + d.completedCount, 0)
  const missed = monthDays.reduce(
    (acc, d) => acc + d.entries.filter((e) => e.status === "missed").length,
    0,
  )
  let bestStreak = 0
  let currentStreak = 0
  for (const d of monthDays) {
    if (d.totalCount > 0 && d.completedCount === d.totalCount) {
      currentStreak += 1
      if (currentStreak > bestStreak) bestStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }
  const hasEntries = monthDays.some((d) => d.totalCount > 0)
  return { totalLogs, missed, bestStreak, hasEntries }
}
