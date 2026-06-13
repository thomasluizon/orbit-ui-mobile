import type { HabitsFilter } from '../types/habit'

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

export function getDailySummaryTimeBucket(date: Date = new Date()): DailySummaryTimeBucket {
  const hour = date.getHours()
  if (hour < 11) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

export function getMsUntilNextDailySummaryTimeBucket(date: Date = new Date()): number {
  const next = new Date(date)
  const hour = date.getHours()
  if (hour < 11) {
    next.setHours(11, 0, 0, 0)
  } else if (hour < 17) {
    next.setHours(17, 0, 0, 0)
  } else if (hour < 21) {
    next.setHours(21, 0, 0, 0)
  } else {
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
  }

  return Math.max(60_000, next.getTime() - date.getTime())
}
