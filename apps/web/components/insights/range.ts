import { subDays, subMonths, subYears, startOfDay } from 'date-fns'
import { formatAPIDate } from '@orbit/shared/utils'

export type RangePreset = 'week' | 'month' | 'quarter' | 'year'

export interface DateRange {
  from: string
  to: string
}

export const RANGE_PRESETS: readonly RangePreset[] = ['week', 'month', 'quarter', 'year']

const rangeStartFor: Record<RangePreset, (to: Date) => Date> = {
  week: (to) => subDays(to, 6),
  month: (to) => subMonths(to, 1),
  quarter: (to) => subMonths(to, 3),
  year: (to) => subYears(to, 1),
}

/**
 * Resolves a range preset to an inclusive `{ from, to }` window of YYYY-MM-DD
 * API dates ending today. Week is a trailing 7 days; month, quarter, and year
 * step back by the matching calendar span.
 */
export function computeRange(preset: RangePreset, today: Date = new Date()): DateRange {
  const to = startOfDay(today)
  return { from: formatAPIDate(rangeStartFor[preset](to)), to: formatAPIDate(to) }
}
