import { useState, useCallback, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BulkRetryChunk, HabitResolutionMode } from '@orbit/shared/utils'
import { executeBulkMoveParent, getBulkActionFailures, isBulkCompletionAllowed, type BulkActionsOptions, type BulkResultItem } from '@orbit/shared/hooks'
import { useBulkDeleteHabits } from '@/hooks/use-bulk-delete-habits'
import { useBulkLogHabits } from '@/hooks/use-bulk-log-habits'
import { useBulkSkipHabits } from '@/hooks/use-bulk-skip-habits'
import { useBulkMoveHabitParent } from '@/hooks/use-bulk-move-habit-parent'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppToast } from '@/hooks/use-app-toast'

interface BulkActionOutcome {
  results: readonly BulkResultItem[]
  retryChunks?: BulkRetryChunk<{ habitId: string; date?: string }>[]
  ambiguousIds?: readonly string[]
  offlineFailureIds?: readonly string[]
  queuedIds?: readonly string[]
}

export function useBulkActions({
  selectedHabitIds,
  habitsById,
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
  const skippableHabitIds = Array.from(selectedHabitIds).filter(id => habitsById.get(id)?.isGeneral === false)
  const currentPermission = useRef({ selectedDateStr, completionReadOnly })
  useLayoutEffect(() => {
    currentPermission.current = { selectedDateStr, completionReadOnly }
  }, [selectedDateStr, completionReadOnly])

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const finish = useCallback((
    outcome: BulkActionOutcome,
    retry: (ids: string[], retainedIds: string[]) => void,
    retainedIds: readonly string[] = [],
    completion = false,
  ) => {
    const { retryIds: failedIds, reasonKeys } = getBulkActionFailures(outcome.results)
    const retryIds = [...new Set([...failedIds, ...(completion ? outcome.ambiguousIds ?? [] : [])])]
    const offlineFailureIds = outcome.offlineFailureIds ?? []

    const queuedIds = outcome.queuedIds ?? []
    const untouchedIds = [...new Set([...retainedIds, ...offlineFailureIds, ...queuedIds])]
    const selectedIds = [...new Set([...retryIds, ...untouchedIds])]
    if (selectedIds.length === 0) onSuccess()
    else onPartialFailure(selectedIds)
    const messages = reasonKeys.map((key) => t(key))
    if (offlineFailureIds.length > 0) messages.push(t('habits.bulkBar.offlineFailure'))
    if (outcome.ambiguousIds?.length) {
      if (completion) messages.push(t('habits.bulkBar.connectionRetry'))
      else showToast({ kind: 'neutral', message: t('habits.bulkBar.connectionRefreshed') })
    }
    if (failedIds.length > 0) messages.push(t('habits.bulkBar.partialFailure', { count: failedIds.length }))
    if (messages.length === 0) return
    const toast = { kind: 'neutral' as const, message: messages.join('\n') }
    if (retryIds.length === 0) showToast(toast)
    else showToast({ ...toast, actionLabel: t('habits.bulkBar.retryFailed'), onAction: () => retry(retryIds, untouchedIds) })
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

  async function executeDelete(ids: string[], retainedIds: string[] = []) {
    if (ids.length === 0) return
    const result: BulkActionOutcome = await bulkDelete.mutateAsync(ids)
    finish(result, (failedIds, untouchedIds) => void executeDelete(failedIds, untouchedIds), retainedIds)
    if (!result.offlineFailureIds?.length && retainedIds.length === 0) {
      setShowBulkDeleteConfirm(false)
    }
  }

  async function executeCompletion(ids: string[], mode: HabitResolutionMode, retainedIds: string[] = [], retryChunks: BulkActionOutcome['retryChunks'] = []) {
    if (!isBulkCompletionAllowed(currentPermission.current, selectedDateStr, accountTimeZone)) return
    if (ids.length === 0) return
    const date = selectedDateStr
    const accountGeneration = getAccountGeneration()
    const items = ids.map((habitId) => ({ habitId, date }))
    const result = await (mode === 'log' ? bulkLog : bulkSkip).mutateAsync(
      retryChunks.length ? { items, retryChunks } : items,
    )
    if (getAccountGeneration() !== accountGeneration) return
    applyBulkMutationSuccesses(result.results, mode, date, result.queuedIds)
    if (currentPermission.current.selectedDateStr !== date) return
    finish(result, (failedIds, untouchedIds) => getAccountGeneration() === accountGeneration && void executeCompletion(failedIds, mode, untouchedIds, result.retryChunks), retainedIds, true)
  }

  return {
    showBulkDeleteConfirm,
    skippableCount: skippableHabitIds.length,
    setShowBulkDeleteConfirm,
    confirmBulkDelete: () => executeDelete(Array.from(selectedHabitIds)),
    confirmBulkLog: () => executeCompletion(Array.from(selectedHabitIds), 'log'),
    confirmBulkSkip: () => executeCompletion(skippableHabitIds, 'skip'),
    confirmBulkMove: (habitIds: string[], parentId: string | null) => executeBulkMoveParent(habitIds, parentId, {
      mutate: bulkMove.mutateAsync, getAccountGeneration, onSuccess, onPartialFailure,
    }),
  }
}
