import { useState, useCallback } from 'react'
import type { HabitResolutionMode } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { HabitListHandle } from '@/components/habit-list'
import type { QueuedMarker } from '@/lib/offline-mutations'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  habitListRef,
  onSuccess,
}: UseBulkActionsOptions) {
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const applyBulkMutationSuccesses = useCallback(
    (results: readonly { status: string; habitId: string }[], mode: HabitResolutionMode) => {
      const resolutions = results.flatMap((item) =>
        item.status === 'Success' ? [{ habitId: item.habitId, mode }] : [],
      )
      habitListRef.current?.settleBulkHabitResolutions(resolutions)
    },
    [habitListRef],
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
      if ((result as typeof result & Partial<QueuedMarker>).queued !== true) {
        applyBulkMutationSuccesses(result.results, 'log')
      }
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
      if ((result as typeof result & Partial<QueuedMarker>).queued !== true) {
        applyBulkMutationSuccesses(result.results, 'skip')
      }
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
