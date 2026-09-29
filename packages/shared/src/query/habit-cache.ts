import type { QueryClient } from '@tanstack/query-core'
import type { HabitScheduleItem, HabitsFilter } from '../types/habit'
import { habitKeys } from './keys'

function includesDate(filters: HabitsFilter, date: string): boolean {
  if (!filters.dateFrom) return true
  return filters.dateFrom <= date && (!filters.dateTo || date <= filters.dateTo)
}

function setCachedHabitList(
  queryClient: QueryClient,
  key: readonly unknown[],
  previous: HabitScheduleItem[],
  next: HabitScheduleItem[],
): void {
  const filters = key[2] as HabitsFilter
  if (filters.dateFrom && filters.dateFrom === filters.dateTo) {
    const countKey = habitKeys.listTotalCount(filters)
    const count = queryClient.getQueryData<number>(countKey)
    if (count !== undefined) {
      const scheduledCount = (items: HabitScheduleItem[]) => items.filter((item) => !item.isGeneral).length
      queryClient.setQueryData(countKey, count + scheduledCount(next) - scheduledCount(previous))
    }
  }
  queryClient.setQueryData(key, next)
}

export function updateCachedHabitLists(
  queryClient: QueryClient,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (items) setCachedHabitList(queryClient, key, items, updater(items))
  }
}

export function restoreCachedHabitLists(
  queryClient: QueryClient,
  snapshots: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[],
): void {
  for (const [key, items] of snapshots) {
    const current = queryClient.getQueryData<HabitScheduleItem[]>(key)
    if (items && current) setCachedHabitList(queryClient, key, current, items)
  }
}

export function updateHabitListsForDate(
  queryClient: QueryClient,
  date: string,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items || !includesDate(key[2] as HabitsFilter, date)) continue
    setCachedHabitList(queryClient, key, items, updater(items))
  }
}

export function getTodayHabitList(queryClient: QueryClient, date: string): HabitScheduleItem[] | undefined {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    const filters = key[2] as HabitsFilter
    if (filters.dateFrom === date && filters.dateTo === date && filters.includeOverdue === true &&
      !filters.search && !filters.frequencyUnit && !filters.tagIds?.length &&
      filters.page === undefined && filters.isCompleted === undefined &&
      filters.isGeneral === undefined && items) {
      const totalCount = queryClient.getQueryData<number>(habitKeys.listTotalCount(filters))
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
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
