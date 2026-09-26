import type { HabitsFilter } from '../types/habit'

export function habitListQueryFilters(filters: HabitsFilter, completeDay: boolean): Record<string, unknown> {
  return completeDay ? { ...filters, completeDay: true } : filters
}

export function shouldFetchAllHabitPages(filters: HabitsFilter, completeDay: boolean, totalPages: number): boolean {
  return totalPages > 1 && (!filters.dateFrom || completeDay)
}
