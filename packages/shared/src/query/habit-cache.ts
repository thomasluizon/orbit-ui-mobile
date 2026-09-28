import type { QueryClient } from '@tanstack/query-core'
import type { HabitScheduleItem, HabitsFilter } from '../types/habit'
import { habitKeys } from './keys'

function includesDate(filters: HabitsFilter, date: string): boolean {
  if (!filters.dateFrom) return true
  return filters.dateFrom <= date && (!filters.dateTo || date <= filters.dateTo)
}

export function updateHabitListsForDate(
  queryClient: QueryClient,
  date: string,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
  options: { includeUnfiltered?: boolean } = {},
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (options.includeUnfiltered === false && !(key[2] as HabitsFilter).dateFrom) continue
    if (!items || !includesDate(key[2] as HabitsFilter, date)) continue
    queryClient.setQueryData(key, updater(items))
  }
}

export function getTodayHabitList(queryClient: QueryClient, date: string): HabitScheduleItem[] | undefined {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    const filters = key[2] as HabitsFilter & { completeDay?: boolean }
    if (filters.completeDay === true && filters.dateFrom === date && filters.dateTo === date && filters.includeOverdue === true &&
      !filters.search && !filters.frequencyUnit && !filters.tagIds?.length &&
      filters.page === undefined && filters.isCompleted === undefined &&
      filters.isGeneral === undefined && items) {
      const countFilters = { ...filters }
      delete countFilters.completeDay
      const totalCount = queryClient.getQueryData<number>(habitKeys.listTotalCount(countFilters))
      const scheduledCount = items.filter((item) => !item.isGeneral).length
      if (totalCount === undefined ? scheduledCount < (filters.pageSize ?? 50) : totalCount === scheduledCount) {
        return items
      }
    }
  }
  return undefined
}

export function deduplicateHabitList(items: HabitScheduleItem[]): HabitScheduleItem[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

export function invalidateHabitDependents(queryClient: QueryClient, habitId: string): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
