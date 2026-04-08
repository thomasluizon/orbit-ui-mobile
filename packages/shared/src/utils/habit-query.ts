import type { HabitsFilter } from '../types/habit'

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
