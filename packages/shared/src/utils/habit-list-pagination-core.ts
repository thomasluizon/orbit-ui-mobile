import type { HabitVisibilityView } from './habit-visibility'
import type { HabitsFilter } from '../types/habit'

export function habitListQueryFilters(filters: HabitsFilter, completeDay: boolean, scheduleDate?: string): Record<string, unknown> {
  if (scheduleDate) return { ...filters, scheduleDate }
  return completeDay ? { ...filters, completeDay: true } : filters
}

export function shouldFetchAllHabitPages(filters: HabitsFilter, completeDay: boolean, totalPages: number): boolean {
  return totalPages > 1 && (!filters.dateFrom || completeDay)
}

export function habitViewQueryOptions(view: HabitVisibilityView, today: string): { completeDay: boolean; scheduleDate: string | undefined } {
  return { completeDay: view === 'today', scheduleDate: view === 'all' ? today : undefined }
}
