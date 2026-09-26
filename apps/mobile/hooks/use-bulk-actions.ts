import { useState, useCallback } from 'react'
import { collectSelectableDescendantIds, hasAncestorInSet } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habit-list'

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

  const applyBulkMutationSuccesses = useCallback(
    (results: readonly { status: string; habitId: string }[]) => {
      const successIds: string[] = []
      for (const item of results) {
        if (item.status === 'Success') successIds.push(item.habitId)
      }

      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }

      promptParentLogsForBulkSuccesses(successIds)
    },
    [habitListRef, promptParentLogsForBulkSuccesses],
  )

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
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [bulkDelete, habitsById, onSuccess, selectedHabitIds])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(ids.map((habitId) => ({ habitId })))
      applyBulkMutationSuccesses(result.results)
    } finally {
      onSuccess()
      setShowBulkLogConfirm(false)
    }
  }, [bulkLog, applyBulkMutationSuccesses, onSuccess, selectedHabitIds])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(ids.map((habitId) => ({ habitId })))
      applyBulkMutationSuccesses(result.results)
    } finally {
      onSuccess()
      setShowBulkSkipConfirm(false)
    }
  }, [bulkSkip, applyBulkMutationSuccesses, onSuccess, selectedHabitIds])

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
