import {
  addDays,
  endOfMonth,
  endOfWeek,
  getDate,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { CalendarDayEntry } from '../types/calendar'
import { formatAPIDate } from './dates'

export interface CalendarMonthDay {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  entries: CalendarDayEntry[]
  completedCount: number
  totalCount: number
  completionRatio: number
}

export interface CalendarMonthStats {
  totalLogs: number
  missed: number
  bestStreak: number
  hasEntries: boolean
}

export interface CalendarMonthModel {
  gridDays: CalendarMonthDay[]
  monthStats: CalendarMonthStats
}

export function buildCalendarMonthModel(
  currentMonth: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
  weekStartsOn: 0 | 1 = 1,
): CalendarMonthModel {
  const gridDays = buildMonthGridDays(currentMonth, dayMap, weekStartsOn)
  const monthDays = gridDays.filter((day) => day.isCurrentMonth)
  const totalLogs = monthDays.reduce((total, day) => total + day.completedCount, 0)
  const missed = monthDays.reduce(
    (total, day) => total + day.entries.filter((entry) => entry.status === 'missed').length,
    0,
  )
  let bestStreak = 0
  let currentStreak = 0

  for (const day of monthDays) {
    if (day.totalCount > 0 && day.completedCount === day.totalCount) {
      currentStreak += 1
      bestStreak = Math.max(bestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  return {
    gridDays,
    monthStats: {
      totalLogs,
      missed,
      bestStreak,
      hasEntries: monthDays.some((day) => day.totalCount > 0),
    },
  }
}

function buildMonthGridDays(
  currentMonth: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
  weekStartsOn: 0 | 1,
): CalendarMonthDay[] {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn })
  const days: CalendarMonthDay[] = []

  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    const dateStr = formatAPIDate(date)
    const entries = dayMap.get(dateStr) ?? []
    const completedCount = entries.filter((entry) => entry.status === 'completed').length
    const totalCount = entries.length
    days.push({
      date,
      dateStr,
      day: getDate(date),
      isCurrentMonth: isSameMonth(date, currentMonth),
      isToday: isToday(date),
      entries,
      completedCount,
      totalCount,
      completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
    })
  }

  return days
}
