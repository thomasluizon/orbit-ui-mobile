import { useState, useCallback } from 'react'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import type { HabitListHandle } from '@/components/habit-list'

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
  const [showBulkLogConfirm, setShowBulkLogConfirm] = useState(false)
  const [showBulkSkipConfirm, setShowBulkSkipConfirm] = useState(false)

  const applyBulkMutationSuccesses = useCallback(
    (
      results: readonly { index: number; status: string; habitId: string }[],
      items: readonly { habitId: string; date?: string }[],
      mode: 'log' | 'skip',
    ) => {
      const successes = results.flatMap((result) => {
        const item = items[result.index]
        return result.status === 'Success' && item?.habitId === result.habitId ? [item] : []
      })
      habitListRef.current?.settleBulkHabitResolutions(successes, mode)
    },
    [habitListRef],
  )

  const confirmBulkDelete = useCallback(async () => {
    if (selectedHabitIds.size === 0) return
    try {
      await bulkDelete.mutateAsync(Array.from(selectedHabitIds))
    } finally {
      onSuccess()
      setShowBulkDeleteConfirm(false)
    }
  }, [bulkDelete, onSuccess, selectedHabitIds])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const items = ids.map((habitId) => ({ habitId, date: selectedDateStr }))
      const result = await bulkLog.mutateAsync(items)
      if (!('queued' in result && result.queued === true)) {
        applyBulkMutationSuccesses(result.results, items, 'log')
      }
    } finally {
      onSuccess()
      setShowBulkLogConfirm(false)
    }
  }, [bulkLog, applyBulkMutationSuccesses, onSuccess, selectedHabitIds, selectedDateStr])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const items = ids.map((habitId) => ({ habitId, date: selectedDateStr }))
      const result = await bulkSkip.mutateAsync(items)
      if (!('queued' in result && result.queued === true)) {
        applyBulkMutationSuccesses(result.results, items, 'skip')
      }
    } finally {
      onSuccess()
      setShowBulkSkipConfirm(false)
    }
  }, [bulkSkip, applyBulkMutationSuccesses, onSuccess, selectedHabitIds, selectedDateStr])

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
