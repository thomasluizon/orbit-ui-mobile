import type { QueryClient } from '@tanstack/query-core'
import type { HabitScheduleItem, HabitsFilter, NormalizedHabit } from '../types/habit'
import { buildChildrenIndex, normalizeHabits } from '../utils/habit-normalization'
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
    if (!items) continue
    if (current) setCachedHabitList(queryClient, key, current, items)
    else queryClient.setQueryData(key, items)
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

function findTodayHabitList(queryClient: QueryClient, date: string, requireFresh: boolean): HabitScheduleItem[] | undefined {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    const filters = key[2] as HabitsFilter
    if (filters.dateFrom === date && filters.dateTo === date && filters.includeOverdue === true &&
      !filters.search && !filters.frequencyUnit && !filters.tagIds?.length &&
      filters.page === undefined && filters.isCompleted === undefined &&
      filters.isGeneral === undefined && items) {
      if (requireFresh && queryClient.getQueryState(key)?.isInvalidated !== false) continue
      const totalCount = queryClient.getQueryData<number>(habitKeys.listTotalCount(filters))
      const scheduledCount = items.filter((item) => !item.isGeneral).length
      if (totalCount === undefined ? scheduledCount < (filters.pageSize ?? 50) : totalCount === scheduledCount) {
        return items
      }
    }
  }
  return undefined
}

export function getTodayHabitList(queryClient: QueryClient, date: string): HabitScheduleItem[] | undefined {
  return findTodayHabitList(queryClient, date, false)
}

export function checkTodayAllDoneOrDefer(
  queryClient: QueryClient,
  today: string,
  loggedDate: string | undefined,
  hadPendingListRefetch: boolean,
  check: (habitsById: Map<string, NormalizedHabit>, childrenByParent: Map<string, string[]>, date: string) => void,
): boolean {
  if (loggedDate && loggedDate !== today) return false
  if (hadPendingListRefetch || queryClient.isFetching({ queryKey: habitKeys.lists() }) > 0) return true
  const items = getTodayHabitList(queryClient, today)
  if (!items) return true
  const normalized = normalizeHabits(items)
  check(normalized, buildChildrenIndex(normalized), today)
  return false
}

export async function getTodayHabitListAfterRefetch(
  queryClient: QueryClient,
  date: string,
): Promise<HabitScheduleItem[] | undefined> {
  await queryClient.invalidateQueries(
    { queryKey: habitKeys.lists(), refetchType: 'all' },
    { cancelRefetch: false },
  )
  return findTodayHabitList(queryClient, date, true)
}

export function deduplicateHabitList(items: HabitScheduleItem[]): HabitScheduleItem[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

export function invalidateHabitDependents(queryClient: QueryClient, habitId: string, includeLists = true): void {
  if (includeLists) void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
