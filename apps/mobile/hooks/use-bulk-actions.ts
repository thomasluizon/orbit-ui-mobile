import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { HabitResolutionMode } from '@orbit/shared/utils'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { HabitListHandle } from '@/components/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  readOnly: boolean
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
}

interface BulkActionOutcome {
  ambiguousIds?: readonly string[]
  offlineFailureIds?: readonly string[]
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  readOnly,
  habitListRef,
  onSuccess,
}: UseBulkActionsOptions) {
  const { t } = useTranslation()
  const { showToast } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const reportBulkFailure = useCallback((outcome: BulkActionOutcome): boolean => {
    if (outcome.ambiguousIds?.length) {
      showToast({
        kind: 'neutral',
        message: t('habits.bulkBar.connectionRefreshed'),
      })
    }
    if (!outcome.offlineFailureIds?.length) return false
    showToast({
      kind: 'neutral',
      message: t('habits.bulkBar.offlineFailure'),
    })
    return true
  }, [showToast, t])

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
    if (readOnly) return
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    const result = await bulkDelete.mutateAsync(ids)
    if (reportBulkFailure(result)) return
    onSuccess()
    setShowBulkDeleteConfirm(false)
  }, [bulkDelete, onSuccess, readOnly, reportBulkFailure, selectedHabitIds])

  const confirmBulkLog = useCallback(async () => {
    if (readOnly) return
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    const result = await bulkLog.mutateAsync(
      ids.map((habitId) => ({ habitId, date: selectedDateStr })),
    )
    if (reportBulkFailure(result)) return
    applyBulkMutationSuccesses(result.results, 'log')
    onSuccess()
  }, [bulkLog, applyBulkMutationSuccesses, onSuccess, readOnly, reportBulkFailure, selectedDateStr, selectedHabitIds])

  const confirmBulkSkip = useCallback(async () => {
    if (readOnly) return
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    const result = await bulkSkip.mutateAsync(
      ids.map((habitId) => ({ habitId, date: selectedDateStr })),
    )
    if (reportBulkFailure(result)) return
    applyBulkMutationSuccesses(result.results, 'skip')
    onSuccess()
  }, [bulkSkip, applyBulkMutationSuccesses, onSuccess, readOnly, reportBulkFailure, selectedDateStr, selectedHabitIds])

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  }
}
