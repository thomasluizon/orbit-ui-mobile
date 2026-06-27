import { addDays, differenceInCalendarDays } from 'date-fns'
import { parseAPIDate, formatAPIDate } from '@orbit/shared/utils'

export const MAX_RANGE_DAYS = 14

export interface ClampedRange {
  start: string
  end: string
  clamped: boolean
}

/** Orders the anchor day (first pick) and the newly picked day into a
 *  [start, end] range, clamped to MAX_RANGE_DAYS so the time grid stays
 *  readable. Picks beyond the cap pull the moved endpoint back toward the
 *  anchor and flag that a clamp happened. */
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
