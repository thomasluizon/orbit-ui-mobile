'use client'

import { useCallback, useEffect, useRef } from 'react'
import { collectSelectableDescendantIds, getTodayBoundary } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useUIStore } from '@/stores/ui-store'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import { useProfile } from '@/hooks/use-profile'
import type { HabitListHandle } from '@/components/habits/habit-list'

interface TodaySelectionParams {
  selectedDateStr: string
  today: string
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  habitsCount: number
  allLoadedIds?: Set<string> | null
  habitListRef: React.RefObject<HabitListHandle | null>
}

/**
 * Owns Today's multi-select cascade and bulk actions: derives the descendant/
 * ancestor selection rules, the select-all state, and threads them into the bulk
 * log/skip/delete confirmations. Pure extraction of TodayPage.
 */
export function useTodaySelection({
  selectedDateStr,
  today,
  habitsById,
  childrenByParent,
  habitsCount,
  allLoadedIds,
  habitListRef,
}: TodaySelectionParams) {
  const { profile } = useProfile()
  const activeView = useUIStore((s) => s.activeView)
  const previousActiveViewRef = useRef(activeView)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const completionReadOnly = getTodayBoundary(selectedDateStr, today) === 'read-only'
  const previousSelectedDateRef = useRef(selectedDateStr)

  const getDescendantIds = useCallback(
    (parentId: string): string[] =>
      collectSelectableDescendantIds(
        parentId,
        (habitId) => childrenByParent.get(habitId) ?? [],
        habitListRef.current?.allLoadedIds,
      ),
    [childrenByParent, habitListRef],
  )

  const handleToggleSelection = useCallback(
    (habitId: string) => {
      toggleSelectionCascade(habitId, getDescendantIds)
    },
    [toggleSelectionCascade, getDescendantIds],
  )

  const allSelected = allLoadedIds ? allLoadedIds.size > 0 && Array.from(allLoadedIds).every((id) => selectedHabitIds.has(id)) : habitsCount > 0 && selectedHabitIds.size === habitsCount

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
    selectedDateStr,
    completionReadOnly,
    accountTimeZone: profile?.timeZone,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
    onPartialFailure: selectAllHabits,
  })
  const { setShowBulkDeleteConfirm } = bulkActions

  useEffect(() => {
    const dateChanged = previousSelectedDateRef.current !== selectedDateStr
    const viewChanged = previousActiveViewRef.current !== activeView
    previousActiveViewRef.current = activeView
    previousSelectedDateRef.current = selectedDateStr
    if (!dateChanged && !viewChanged) return
    setShowBulkDeleteConfirm(false)
    clearSelection()
  }, [activeView, clearSelection, selectedDateStr, setShowBulkDeleteConfirm])

  return {
    handleToggleSelection,
    allSelected,
    selectAll,
    deselectAll,
    completionReadOnly,
    ...bulkActions,
  }
}
