import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDate,
  isBefore,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { HabitLog } from '../types/calendar'

export type HabitCalendarWeekdayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

export interface HabitCalendarDayCell {
  date: Date
  dateStr: string
  dayNum: number
  isCurrentMonth: boolean
  isToday: boolean
  isPast: boolean
  isCompleted: boolean
}

export function buildHabitCalendarWeekdayKeys(
  weekStartsOn: 0 | 1,
): HabitCalendarWeekdayKey[] {
  const sundayFirst: HabitCalendarWeekdayKey[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]

  return weekStartsOn === 1
    ? [...sundayFirst.slice(1), sundayFirst[0]!]
    : sundayFirst
}

export function buildHabitLogDateSet(
  logs: ReadonlyArray<Pick<HabitLog, 'date'>>,
): ReadonlySet<string> {
  return new Set(logs.map((log) => log.date))
}

export function buildHabitCalendarDayCells(
  currentMonth: Date,
  weekStartsOn: 0 | 1,
  completedDates: ReadonlySet<string>,
  now: Date = new Date(),
): HabitCalendarDayCell[] {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })

  return eachDayOfInterval({ start: calStart, end: calEnd }).map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    return {
      date: day,
      dateStr,
      dayNum: getDate(day),
      isCurrentMonth: isSameMonth(day, currentMonth),
      isToday: isToday(day),
      isPast: isBefore(day, now) && !isToday(day),
      isCompleted: completedDates.has(dateStr),
    }
  })
}
