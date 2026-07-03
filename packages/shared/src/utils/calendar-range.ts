import { addDays, differenceInCalendarDays, min } from 'date-fns'
import { parseAPIDate, formatAPIDate } from './dates'

export const MAX_RANGE_DAYS = 14

/** Maximum dateFrom→dateTo span the calendar-month endpoint accepts, mirroring
 *  orbit-api `AppConstants.MaxCalendarRangeDays`. The API rejects any request
 *  whose `DateTo - DateFrom` day difference exceeds this. */
export const CALENDAR_MONTH_MAX_RANGE_DAYS = 62

export interface CalendarRangeChunk {
  from: string
  to: string
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

export interface ClampedRange {
  start: string
  end: string
  clamped: boolean
}

/** Orders the anchor day (first pick) and the newly picked day into a
 *  [start, end] range, clamped to MAX_RANGE_DAYS so the time grid stays
 *  readable. Picks beyond the cap pull the moved endpoint back toward the
 *  anchor and flag that a clamp happened. Shared by the web and mobile
 *  calendar interval views so the 14-day cap behaves identically. */
export function clampRangeToMaxDays(anchor: string, picked: string): ClampedRange {
  const anchorDate = parseAPIDate(anchor)
  const pickedDate = parseAPIDate(picked)
  const delta = differenceInCalendarDays(pickedDate, anchorDate)

  let cappedDate = pickedDate
  let clamped = false
  if (Math.abs(delta) + 1 > MAX_RANGE_DAYS) {
    const direction = delta >= 0 ? 1 : -1
    cappedDate = addDays(anchorDate, direction * (MAX_RANGE_DAYS - 1))
    clamped = true
  }

  const cappedStr = formatAPIDate(cappedDate)
  const start = cappedStr <= anchor ? cappedStr : anchor
  const end = cappedStr <= anchor ? anchor : cappedStr
  return { start, end, clamped }
}
