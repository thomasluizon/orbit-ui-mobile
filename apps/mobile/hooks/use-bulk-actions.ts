import { useState, useCallback } from 'react'
import { hasAncestorInSet } from '@orbit/shared/utils'
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
      const result = await bulkLog.mutateAsync(ids.map((habitId) => ({ habitId })))
      const successIds = result.results
        .filter((item) => item.status === 'Success')
        .map((item) => item.habitId)

      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }

      promptParentLogsForBulkSuccesses(successIds)
    } finally {
      onSuccess()
      setShowBulkLogConfirm(false)
    }
  }, [bulkLog, habitListRef, onSuccess, promptParentLogsForBulkSuccesses, selectedHabitIds])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(ids.map((habitId) => ({ habitId })))
      const successIds = result.results
        .filter((item) => item.status === 'Success')
        .map((item) => item.habitId)

      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }

      promptParentLogsForBulkSuccesses(successIds)
    } finally {
      onSuccess()
      setShowBulkSkipConfirm(false)
    }
  }, [bulkSkip, habitListRef, onSuccess, promptParentLogsForBulkSuccesses, selectedHabitIds])

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
