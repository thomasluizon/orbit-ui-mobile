import type { HabitsFilter } from '../types/habit'
import { getAccountDateTime } from './dates'

type DailySummaryTimeBucket = 'morning' | 'afternoon' | 'evening' | 'night'

export function buildHabitQueryString(filters: HabitsFilter): string {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.append('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.append('dateTo', filters.dateTo)
  if (filters.includeOverdue) params.append('includeOverdue', 'true')
  if (filters.isGeneral) params.append('isGeneral', 'true')
  if (filters.includeGeneral) params.append('includeGeneral', 'true')
  if (filters.search) params.append('search', filters.search)
  if (filters.isCompleted !== undefined) params.append('isCompleted', String(filters.isCompleted))
  if (filters.frequencyUnit) params.append('frequencyUnit', filters.frequencyUnit)

  if (filters.tagIds?.length) {
    for (const tagId of filters.tagIds) {
      params.append('tagIds', tagId)
    }
  }

  if (filters.page) params.append('page', String(filters.page))
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize))

  return params.toString()
}

export function buildUrlWithQuery(base: string, queryString: string): string {
  return queryString ? `${base}?${queryString}` : base
}

export function getDailySummaryTimeBucket(date: Date = new Date(), timeZone?: string | null): DailySummaryTimeBucket {
  const hour = getAccountDateTime(date, timeZone).minutes / 60
  if (hour < 11) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

export function getMsUntilNextDailySummaryTimeBucket(date: Date = new Date(), timeZone?: string | null): number {
  const currentDay = getAccountDateTime(date, timeZone).date
  const currentBucket = getDailySummaryTimeBucket(date, timeZone)
  let before = 0
  let after = 24 * 60 * 60_000
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2)
    const instant = new Date(date.getTime() + middle)
    if (getAccountDateTime(instant, timeZone).date === currentDay
      && getDailySummaryTimeBucket(instant, timeZone) === currentBucket) before = middle
    else after = middle
  }
  return Math.max(60_000, after)
}
