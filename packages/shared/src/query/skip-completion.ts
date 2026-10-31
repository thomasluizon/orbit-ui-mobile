import type { QueryClient } from '@tanstack/react-query'
import type { BulkSkipItemRequest } from '../types/habit'
import type { UIStoreState } from '../stores/ui-store'
import { buildChildrenIndex, normalizeHabits } from '../utils/habit-normalization'
import { getAccountDay } from '../utils/dates'
import { getTodayHabitList } from './habit-cache'
import { clearCachedOptimisticSkip, restoreCachedHabitSkip } from './habit-cache'
import { findHabitInList } from '../utils/habit-optimistic'
import type { HabitListSnapshots } from './keys'

export function checkCompletionAfterSkip(
  queryClient: QueryClient,
  confirmed: readonly BulkSkipItemRequest[],
  timeZone: string | null | undefined,
  check: UIStoreState['checkAllDoneCelebration'],
  snapshots: HabitListSnapshots,
): void {
  const today = getAccountDay(new Date(), timeZone)
  const skippedIds = new Set(confirmed.filter((item) => !item.date || item.date === today).map((item) => item.habitId))
  if (skippedIds.size === 0) return
  const items = getTodayHabitList(queryClient, today)
  if (!items) return
  const habits = normalizeHabits(items)
  const previous = normalizeHabits(snapshots.flatMap(([, habits]) => habits ?? []))
  for (const id of skippedIds) {
    const skipped = previous.get(id)
    if (skipped && !habits.has(id)) habits.set(id, skipped)
  }
  for (const [id, habit] of habits) {
    if (habit.parentId && !habits.has(habit.parentId)) habits.set(id, { ...habit, parentId: null })
  }
  check(habits, buildChildrenIndex(habits), today, timeZone, skippedIds)
}

export function settleBulkSkippedHabits(
  queryClient: QueryClient,
  items: readonly BulkSkipItemRequest[],
  snapshots: HabitListSnapshots,
  rejectedIds: ReadonlySet<string>,
  occurrenceDate: string,
): BulkSkipItemRequest[] {
  const confirmed: BulkSkipItemRequest[] = []
  for (const item of items) {
    const date = item.date ?? occurrenceDate
    if (rejectedIds.has(item.habitId)) {
      const previous = snapshots.flatMap(([, habits]) => habits ? [findHabitInList(habits, item.habitId)] : []).find((habit) => habit !== null)
      restoreCachedHabitSkip(queryClient, snapshots, item.habitId, { date, postponed: previous?.frequencyUnit === null })
    } else {
      clearCachedOptimisticSkip(queryClient, item.habitId, date)
      confirmed.push({ habitId: item.habitId, date })
    }
  }
  return confirmed
}
