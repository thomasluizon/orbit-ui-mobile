'use client'

import { useState, useCallback } from 'react'
import { hasAncestorInSet } from '@orbit/shared/utils'
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
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkDelete.mutateAsync(ids)
    } catch {
      // Error handled in hook
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [selectedHabitIds, bulkDelete, onSuccess])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(ids.map((id) => ({ habitId: id })))
      const successIds = result.results
        .filter((r) => r.status === 'Success')
        .map((r) => r.habitId)
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      promptParentLogsForBulkSuccesses(successIds)
    } catch {
      // Error handled in hook
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
      const successIds = result.results
        .filter((r) => r.status === 'Success')
        .map((r) => r.habitId)
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      promptParentLogsForBulkSuccesses(successIds)
    } catch {
      // Error handled in hook
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
