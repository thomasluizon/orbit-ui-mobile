import type { CalendarDayEntry } from '../types/calendar'
import type { HabitMonthCard } from '../types/chat'
import { buildCalendarDayMap } from '../utils/habits'
import { parseAPIDate } from '../utils/dates'

export function buildHabitMonthCalendar(card: HabitMonthCard): { dayMap: Map<string, CalendarDayEntry[]>; months: Date[]; range: { from: string; to: string } } {
  const range = { from: card.dateFrom, to: card.dateTo }
  const dayMap = buildCalendarDayMap(card.calendar, range, parseAPIDate(card.today))
  const first = parseAPIDate(card.dateFrom)
  const last = parseAPIDate(card.dateTo)
  const months: Date[] = []
  for (let month = new Date(first.getFullYear(), first.getMonth(), 1); month <= last;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    months.push(month)
  }
  return { dayMap, months, range }
}
