import { useState, useCallback, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { HabitResolutionMode } from '@orbit/shared/utils'
import { executeBulkMoveParent, getFailedBulkHabitIds, isBulkCompletionAllowed, type BulkActionsOptions, type BulkResultItem } from '@orbit/shared/hooks'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits, useBulkMoveHabitParent } from '@/hooks/use-habits'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppToast } from '@/hooks/use-app-toast'

interface BulkActionOutcome {
  results: readonly BulkResultItem[]
  ambiguousIds?: readonly string[]
  offlineFailureIds?: readonly string[]
  queuedIds?: readonly string[]
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  completionReadOnly,
  accountTimeZone,
  habitListRef,
  onSuccess,
  onPartialFailure,
}: BulkActionsOptions) {
  const { t } = useTranslation()
  const { showToast } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()
  const bulkMove = useBulkMoveHabitParent()
  const currentPermission = useRef({ selectedDateStr, completionReadOnly })
  useLayoutEffect(() => {
    currentPermission.current = { selectedDateStr, completionReadOnly }
  }, [selectedDateStr, completionReadOnly])

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const finish = useCallback((
    outcome: BulkActionOutcome,
    retry: (ids: string[]) => void,
  ) => {
    const offlineFailureIds = outcome.offlineFailureIds ?? []
    const failedIds = Array.from(new Set([
      ...getFailedBulkHabitIds(outcome.results),
      ...offlineFailureIds,
    ]))
    if (outcome.ambiguousIds?.length) {
      showToast({
        kind: 'neutral',
        message: t('habits.bulkBar.connectionRefreshed'),
      })
    }
    const queuedIds = outcome.queuedIds ?? []
    if (failedIds.length === 0 && queuedIds.length === 0) return onSuccess()
    onPartialFailure([...new Set([...failedIds, ...queuedIds])])
    if (failedIds.length === 0) return
    if (offlineFailureIds.length > 0) {
      showToast({
        kind: 'neutral',
        message: t('habits.bulkBar.offlineFailure'),
      })
      return
    }
    showToast({
      kind: 'neutral',
      message: t('habits.bulkBar.partialFailure', { count: failedIds.length }),
      actionLabel: t('habits.bulkBar.retryFailed'),
      onAction: () => retry(failedIds),
    })
  }, [onPartialFailure, onSuccess, showToast, t])

  const applyBulkMutationSuccesses = useCallback(
    (results: readonly { status: string; habitId: string }[], mode: HabitResolutionMode, date: string, queuedIds: readonly string[] = []) => {
      const resolutions = results.flatMap((item) =>
        item.status === 'Success' && !queuedIds.includes(item.habitId) ? [{ habitId: item.habitId, mode }] : [],
      )
      if (resolutions.length === 0) return
      habitListRef.current?.settleBulkHabitResolutions(resolutions, date)
    },
    [habitListRef],
  )

  async function executeDelete(ids: string[]) {
    if (ids.length === 0) return
    const result: BulkActionOutcome = await bulkDelete.mutateAsync(ids)
    finish(result, (failedIds) => void executeDelete(failedIds))
    if (!result.offlineFailureIds?.length) {
      setShowBulkDeleteConfirm(false)
    }
  }

  async function executeCompletion(ids: string[], mode: HabitResolutionMode) {
    if (!isBulkCompletionAllowed(currentPermission.current, selectedDateStr, accountTimeZone)) return
    if (ids.length === 0) return
    const date = selectedDateStr
    const result = await (mode === 'log' ? bulkLog : bulkSkip).mutateAsync(
      ids.map((habitId) => ({ habitId, date })),
    )
    applyBulkMutationSuccesses(result.results, mode, date, result.queuedIds)
    if (currentPermission.current.selectedDateStr !== date) return
    finish(result, (failedIds) => void executeCompletion(failedIds, mode))
  }

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete: () => executeDelete(Array.from(selectedHabitIds)),
    confirmBulkLog: () => executeCompletion(Array.from(selectedHabitIds), 'log'),
    confirmBulkSkip: () => executeCompletion(Array.from(selectedHabitIds), 'skip'),
    confirmBulkMove: (habitIds: string[], parentId: string | null) => executeBulkMoveParent(habitIds, parentId, {
      mutate: bulkMove.mutateAsync, getAccountGeneration, onSuccess, onPartialFailure,
    }),
  }
}
