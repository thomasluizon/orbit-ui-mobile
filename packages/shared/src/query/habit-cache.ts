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
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items || !includesDate(key[2] as HabitsFilter, date)) continue
    queryClient.setQueryData(key, updater(items))
  }
}

export function invalidateHabitDateLists(queryClient: QueryClient, date: string): void {
  for (const [key] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    const filters = key[2] as HabitsFilter
    if (filters.dateFrom && includesDate(filters, date)) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

export function invalidateHabitDependents(queryClient: QueryClient, habitId: string): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
