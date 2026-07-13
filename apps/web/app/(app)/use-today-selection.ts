'use client'

import { useCallback } from 'react'
import { collectSelectableDescendantIds } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useUIStore } from '@/stores/ui-store'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import type { HabitListHandle } from '@/components/habits/habit-list'

interface TodaySelectionParams {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  habitsCount: number
  habitListRef: React.RefObject<HabitListHandle | null>
}

/**
 * Owns Today's multi-select cascade and bulk actions: derives the descendant/
 * ancestor selection rules, the select-all state, and threads them into the bulk
 * log/skip/delete confirmations. Pure extraction of TodayPage.
 */
export function useTodaySelection({
  habitsById,
  childrenByParent,
  habitsCount,
  habitListRef,
}: TodaySelectionParams) {
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)

  const getDescendantIds = useCallback(
    (parentId: string): string[] =>
      collectSelectableDescendantIds(
        parentId,
        (habitId) => childrenByParent.get(habitId) ?? [],
        habitListRef.current?.allLoadedIds,
      ),
    [childrenByParent, habitListRef],
  )

  const isAncestorSelected = useCallback(
    (habitId: string): boolean => {
      function walk(currentId: string): boolean {
        const habit = habitsById.get(currentId)
        if (!habit?.parentId) return false
        if (selectedHabitIds.has(habit.parentId)) return true
        return walk(habit.parentId)
      }
      return walk(habitId)
    },
    [habitsById, selectedHabitIds],
  )

  const handleToggleSelection = useCallback(
    (habitId: string) => {
      toggleSelectionCascade(habitId, getDescendantIds, isAncestorSelected)
    },
    [toggleSelectionCascade, getDescendantIds, isAncestorSelected],
  )

  const allSelected = habitsCount > 0 && selectedHabitIds.size === habitsCount

  const selectAll = useCallback(() => {
    const loaded = habitListRef.current?.allLoadedIds
    const allIds = loaded ? Array.from(loaded) : Array.from(habitsById.keys())
    selectAllHabits(allIds)
  }, [habitsById, selectAllHabits, habitListRef])

  const deselectAll = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const bulkActions = useBulkActions({
    selectedHabitIds,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
  })

  return {
    handleToggleSelection,
    allSelected,
    selectAll,
    deselectAll,
    ...bulkActions,
  }
}
