import { addDays, getDate, getDay, min } from 'date-fns'
import type { CalendarDayEntry } from '../types/calendar'
import { parseAPIDate, formatAPIDate } from './dates'
import {
  deriveCalendarStats,
  type CalendarMonthDay,
  type CalendarMonthStats,
} from './calendar-month'

export const MAX_RANGE_DAYS = 14

/** Maximum dateFrom→dateTo span the calendar-month endpoint accepts, mirroring
 *  orbit-api `AppConstants.MaxCalendarRangeDays`. The API rejects any request
 *  whose `DateTo - DateFrom` day difference exceeds this. */
export const CALENDAR_MONTH_MAX_RANGE_DAYS = 62

export interface CalendarRangeChunk {
  from: string
  to: string
}

export interface CalendarRangeModel {
  start: Date
  end: Date
  startKey: string
  endKey: string
  leadingEmptyDays: number
  days: CalendarMonthDay[]
  stats: CalendarMonthStats
}

/** Builds the fixed fourteen-day orientation span used by both calendar apps. */
export function buildCalendarRangeModel(
  end: Date,
  dayMap: Map<string, CalendarDayEntry[]>,
  weekStartsOn: 0 | 1,
  todayKey: string,
): CalendarRangeModel {
  const start = addDays(end, -(MAX_RANGE_DAYS - 1))
  const days: CalendarMonthDay[] = []

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const dateStr = formatAPIDate(date)
    const entries = dayMap.get(dateStr) ?? []
    const completedCount = entries.filter((entry) => entry.status === 'completed').length
    const totalCount = entries.length
    days.push({
      date,
      dateStr,
      day: getDate(date),
      isCurrentMonth: true,
      isToday: dateStr === todayKey,
      entries,
      completedCount,
      totalCount,
      completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
    })
  }

  return {
    start,
    end,
    startKey: formatAPIDate(start),
    endKey: formatAPIDate(end),
    leadingEmptyDays: (getDay(start) - weekStartsOn + 7) % 7,
    days,
    stats: deriveCalendarStats(days, todayKey),
  }
}

export function resolveCalendarRangeEnd(anchor: Date, pageOffset: number): Date {
  return addDays(anchor, pageOffset * MAX_RANGE_DAYS)
}

/** Splits an inclusive [from, to] date range into contiguous, non-overlapping
 *  chunks each spanning at most CALENDAR_MONTH_MAX_RANGE_DAYS days (dateTo minus
 *  dateFrom), so no single calendar-month request breaches the API's 62-day cap.
 *  A range already within the cap yields a single chunk identical to its input.
 *  Assumes from <= to (callers order the endpoints before requesting). */
export function splitCalendarMonthRange(from: string, to: string): CalendarRangeChunk[] {
  const end = parseAPIDate(to)
  const chunks: CalendarRangeChunk[] = []

  let chunkStart = parseAPIDate(from)
  while (chunkStart <= end) {
    const chunkEnd = min([addDays(chunkStart, CALENDAR_MONTH_MAX_RANGE_DAYS), end])
    chunks.push({ from: formatAPIDate(chunkStart), to: formatAPIDate(chunkEnd) })
    chunkStart = addDays(chunkEnd, 1)
  }

  return chunks
}
