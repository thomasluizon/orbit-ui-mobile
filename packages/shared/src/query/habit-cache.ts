import type { QueryClient } from '@tanstack/query-core'
import type { HabitScheduleItem, HabitsFilter, NormalizedHabit } from '../types/habit'
import { buildChildrenIndex, normalizeHabits } from '../utils/habit-normalization'
import { buildOptimisticSkipPatch, clearOptimisticSkipMarker, findHabitInList, findHabitInTree, getTomorrowDateString, optimisticPatchHabit, withChildren, type HabitTreeNode } from '../utils/habit-optimistic'
import { habitKeys } from './keys'

function includesDate(filters: HabitsFilter, date: string): boolean {
  if (!filters.dateFrom) return true
  return filters.dateFrom <= date && (!filters.dateTo || date <= filters.dateTo)
}

type HabitListFilters = HabitsFilter & { completeDay?: boolean }

const skippedHabitRows = new WeakMap<QueryClient, WeakMap<readonly unknown[], Map<string, HabitTreeNode>>>()

function refreshRetainedSkippedRows(queryClient: QueryClient): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items) continue
    const retained = skippedHabitRows.get(queryClient)?.get(key)
    for (const habitId of retained?.keys() ?? []) {
      const habit = findHabitInList(items, habitId)
      if (habit) retained?.set(habitId, habit)
    }
  }
}

function retainedSkippedRows(queryClient: QueryClient, key: readonly unknown[]): Map<string, HabitTreeNode> {
  let lists = skippedHabitRows.get(queryClient)
  if (!lists) {
    lists = new WeakMap<readonly unknown[], Map<string, HabitTreeNode>>()
    skippedHabitRows.set(queryClient, lists)
    queryClient.getQueryCache().subscribe(() => refreshRetainedSkippedRows(queryClient))
  }
  const rows = lists.get(key) ?? new Map<string, HabitTreeNode>()
  lists.set(key, rows)
  return rows
}

/** A complete-day list shares its day's total with the ordinary list, so the count key omits `completeDay`. */
function listTotalCountKey(filters: HabitListFilters) {
  const countFilters = { ...filters }
  delete countFilters.completeDay
  return habitKeys.listTotalCount(countFilters)
}

function setCachedHabitList(
  queryClient: QueryClient,
  key: readonly unknown[],
  previous: HabitScheduleItem[],
  next: HabitScheduleItem[],
): void {
  const filters = key[2] as HabitListFilters | undefined
  if (filters?.completeDay === true && filters.dateFrom && filters.dateFrom === filters.dateTo) {
    const countKey = listTotalCountKey(filters)
    const count = queryClient.getQueryData<number>(countKey)
    if (count !== undefined) {
      const scheduledCount = (items: HabitScheduleItem[]) => items.filter((item) => !item.isGeneral).length
      queryClient.setQueryData(countKey, count + scheduledCount(next) - scheduledCount(previous))
    }
  }
  queryClient.setQueryData(key, next)
}

export function applyCachedHabitSkip(queryClient: QueryClient, habitId: string, date: string): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items || !includesDate(key[2] as HabitsFilter, date)) continue
    const habit = findHabitInList(items, habitId)
    if (!habit) continue
    retainedSkippedRows(queryClient, key).set(habitId, habit)
    setCachedHabitList(queryClient, key, items, optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(habit, date)))
  }
}

export function updateCachedHabitLists(
  queryClient: QueryClient,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (items) setCachedHabitList(queryClient, key, items, updater(items))
  }
}

export function clearCachedOptimisticSkip(
  queryClient: QueryClient,
  habitId: string,
  date: string,
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items) continue
    const settled = clearOptimisticSkipMarker(items, habitId, date)
    if (settled !== items) setCachedHabitList(queryClient, key, items, settled)
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

export function restoreCachedHabitSkip(
  queryClient: QueryClient,
  snapshots: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[],
  habitId: string,
  occurrence: { date: string; postponed: boolean },
): void {
  for (const [key, items] of snapshots) {
    if (!includesDate(key[2] as HabitsFilter, occurrence.date)) continue
    const current = queryClient.getQueryData<HabitScheduleItem[]>(key)
    if (!items || !current) continue
    setCachedHabitList(queryClient, key, current,
      restoreSkipBranch(current, items, habitId, occurrence, skippedHabitRows.get(queryClient)?.get(key)))
  }
  clearCachedOptimisticSkip(queryClient, habitId, occurrence.date)
}

function reverseSkippedOccurrence<T extends HabitTreeNode>(
  current: T,
  previous: T,
  { date, postponed }: { date: string; postponed: boolean },
): T {
  const postponedDate = postponed ? getTomorrowDateString(date) : null
  const hasLaterLog = current.instances.some((instance) => instance.date === postponedDate &&
    (instance.status === 'Completed' || instance.logId !== null))
  const removedDate = hasLaterLog ? null : postponedDate
  const scheduledDates = [...new Set([
    ...(current.scheduledDates ?? []).filter((scheduled) => scheduled !== removedDate),
    ...(previous.scheduledDates ?? []).filter((scheduled) => scheduled === date),
  ])].sort((first, second) => first.localeCompare(second))
  const instances = current.instances.filter((instance) => instance.date !== removedDate)
  for (const instance of previous.instances.filter((instance) => instance.date === date)) {
    if (!instances.some((currentInstance) => currentInstance.date === date)) instances.push(instance)
  }
  const dueDate = postponed && current.dueDate === postponedDate ? previous.dueDate
    : scheduledDates.filter((scheduled) => scheduled <= current.dueDate)[0] ?? current.dueDate
  return {
    ...current,
    dueDate,
    scheduledDates,
    instances: instances.sort((first, second) => first.date.localeCompare(second.date)),
    isOverdue: dueDate === previous.dueDate && dueDate === date ? previous.isOverdue : current.isOverdue,
    ...(current.isFlexible && current.flexibleTarget != null ? { flexibleTarget: current.flexibleTarget + 1 } : {}),
  }
}

function restoreSkipBranch<T extends HabitTreeNode>(
  current: T[], previous: T[], habitId: string, occurrence: { date: string; postponed: boolean },
  retained: ReadonlyMap<string, HabitTreeNode> | undefined,
): T[] {
  const restored = [...current]
  for (const [index, original] of previous.entries()) {
    if (!findHabitInTree(original, habitId)) continue
    const item = restored.find((entry) => entry.id === original.id)
    if (!item) {
      restored.splice(Math.min(index, restored.length), 0, original.id === habitId
        ? reverseSkippedOccurrence({ ...original, scheduledDates: [], instances: [],
          flexibleTarget: original.flexibleTarget == null ? original.flexibleTarget : original.flexibleTarget - 1,
          ...retained?.get(habitId) }, original, occurrence)
        : withChildren(original, restoreSkipBranch([], original.children, habitId, occurrence, retained)))
      continue
    }
    const currentIndex = restored.indexOf(item)
    restored[currentIndex] = item.id === habitId ? reverseSkippedOccurrence(item, original, occurrence)
      : withChildren(item, restoreSkipBranch(item.children, original.children, habitId, occurrence, retained))
  }
  return restored
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
    setCachedHabitList(queryClient, key, items, updater(items))
  }
}

function findTodayHabitList(queryClient: QueryClient, date: string, requireFresh: boolean): HabitScheduleItem[] | undefined {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    const filters = key[2] as HabitListFilters
    if (filters.completeDay === true && filters.dateFrom === date && filters.dateTo === date && filters.includeOverdue === true &&
      !filters.search && !filters.frequencyUnit && !filters.tagIds?.length &&
      filters.page === undefined && filters.isCompleted === undefined &&
      filters.isGeneral === undefined && items) {
      if (requireFresh && queryClient.getQueryState(key)?.isInvalidated !== false) continue
      const totalCount = queryClient.getQueryData<number>(listTotalCountKey(filters))
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

/** Refetches every habit list, replacing a fetch already in flight, since one that began before a log settled can return the unlogged row. */
export async function getTodayHabitListAfterRefetch(
  queryClient: QueryClient,
  date: string,
): Promise<HabitScheduleItem[] | undefined> {
  await queryClient.invalidateQueries({ queryKey: habitKeys.lists(), refetchType: 'all' })
  return findTodayHabitList(queryClient, date, true)
}

export function deduplicateHabitList(items: HabitScheduleItem[]): HabitScheduleItem[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

export function invalidateHabitDependents(queryClient: QueryClient, habitId: string, includeLists = true): void {
  if (includeLists) void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.searches() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
