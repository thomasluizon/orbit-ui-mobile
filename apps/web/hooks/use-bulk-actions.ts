'use client'

import { useState, useCallback } from 'react'
import { collectSelectableDescendantIds, hasAncestorInSet } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habits/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  habitsById: Map<string, NormalizedHabit>
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
}

export function useBulkActions({
  selectedHabitIds,
  habitsById,
  habitListRef,
  onSuccess,
}: UseBulkActionsOptions) {
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showBulkLogConfirm, setShowBulkLogConfirm] = useState(false)
  const [showBulkSkipConfirm, setShowBulkSkipConfirm] = useState(false)

  const promptParentLogsForBulkSuccesses = useCallback((successIds: string[]) => {
    const successIdSet = new Set(successIds)

    for (const id of successIds) {
      if (hasAncestorInSet(id, habitsById, successIdSet)) {
        continue
      }

      habitListRef.current?.checkAndPromptParentLog(id)
    }
  }, [habitsById, habitListRef])

  const confirmBulkDelete = useCallback(async () => {
    if (selectedHabitIds.size === 0) return
    const childrenByParent = new Map<string, string[]>()
    for (const habit of habitsById.values()) {
      if (!habit.parentId) continue
      const childIds = childrenByParent.get(habit.parentId) ?? []
      childIds.push(habit.id)
      childrenByParent.set(habit.parentId, childIds)
    }
    const ids = new Set(selectedHabitIds)
    for (const id of selectedHabitIds) {
      for (const descendantId of collectSelectableDescendantIds(
        id,
        (parentId) => childrenByParent.get(parentId) ?? [],
      )) ids.add(descendantId)
    }
    try {
      await bulkDelete.mutateAsync(Array.from(ids))
    } catch {
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [selectedHabitIds, habitsById, bulkDelete, onSuccess])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(ids.map((id) => ({ habitId: id })))
      const successIds = result.results.flatMap((r) =>
        r.status === 'Success' ? [r.habitId] : [],
      )
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      promptParentLogsForBulkSuccesses(successIds)
    } catch {
    } finally {
      onSuccess()
      setShowBulkLogConfirm(false)
    }
  }, [selectedHabitIds, bulkLog, habitListRef, onSuccess, promptParentLogsForBulkSuccesses])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(ids.map((id) => ({ habitId: id })))
      const successIds = result.results.flatMap((r) =>
        r.status === 'Success' ? [r.habitId] : [],
      )
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      promptParentLogsForBulkSuccesses(successIds)
    } catch {
    } finally {
      onSuccess()
      setShowBulkSkipConfirm(false)
    }
  }, [selectedHabitIds, bulkSkip, habitListRef, onSuccess, promptParentLogsForBulkSuccesses])

  return {
    showBulkDeleteConfirm,
    showBulkLogConfirm,
    showBulkSkipConfirm,
    setShowBulkDeleteConfirm,
    setShowBulkLogConfirm,
    setShowBulkSkipConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  }
}
