'use client'

import { useState, useCallback } from 'react'
import { hasAncestorInSet } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habits/habit-list'

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

  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkDelete.mutateAsync(ids)
    } catch {
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [selectedHabitIds, bulkDelete, onSuccess])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(
        ids.map((id) => ({ habitId: id, date: selectedDateStr })),
      )
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
    }
  }, [selectedHabitIds, selectedDateStr, bulkLog, habitListRef, onSuccess, promptParentLogsForBulkSuccesses])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(
        ids.map((id) => ({ habitId: id, date: selectedDateStr })),
      )
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
    }
  }, [selectedHabitIds, selectedDateStr, bulkSkip, habitListRef, onSuccess, promptParentLogsForBulkSuccesses])

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  }
}
