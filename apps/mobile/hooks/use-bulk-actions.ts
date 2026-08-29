import { useState, useCallback } from 'react'
import { hasAncestorInSet } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  habitsById: Map<string, NormalizedHabit>
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  habitsById,
  habitListRef,
  onSuccess,
}: UseBulkActionsOptions) {
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const promptParentLogsForBulkSuccesses = useCallback((successIds: string[]) => {
    const successIdSet = new Set(successIds)

    for (const id of successIds) {
      if (hasAncestorInSet(id, habitsById, successIdSet)) {
        continue
      }

      habitListRef.current?.checkAndPromptParentLog(id, selectedDateStr)
    }
  }, [habitsById, habitListRef, selectedDateStr])

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
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkDelete.mutateAsync(ids)
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [bulkDelete, onSuccess, selectedHabitIds])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(
        ids.map((habitId) => ({ habitId, date: selectedDateStr })),
      )
      applyBulkMutationSuccesses(result.results)
    } finally {
      onSuccess()
    }
  }, [bulkLog, applyBulkMutationSuccesses, onSuccess, selectedDateStr, selectedHabitIds])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(
        ids.map((habitId) => ({ habitId, date: selectedDateStr })),
      )
      applyBulkMutationSuccesses(result.results)
    } finally {
      onSuccess()
    }
  }, [bulkSkip, applyBulkMutationSuccesses, onSuccess, selectedDateStr, selectedHabitIds])

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  }
}
