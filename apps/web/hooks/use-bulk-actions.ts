'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitResolutionMode } from '@orbit/shared/utils'
import { executeBulkMoveParent, getBulkActionFailures, isBulkCompletionAllowed, type BulkActionsOptions, type BulkResultItem } from '@orbit/shared/hooks'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits, useBulkMoveHabitParent } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'

interface BulkActionOutcome {
  results: readonly BulkResultItem[]
  ambiguousIds?: readonly string[]
}

function reportAccountSwitch(error: unknown): boolean {
  return reportsAccountChanged(error)
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
  const t = useTranslations()
  const { showToast, showQueued } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()
  const bulkMove = useBulkMoveHabitParent()
  const currentPermission = useRef({ selectedDateStr, completionReadOnly })
  useLayoutEffect(() => {
    currentPermission.current = { selectedDateStr, completionReadOnly }
  }, [selectedDateStr, completionReadOnly])

  /** Clear an armed delete when the account changes, not only when the date changes. */
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useAccountScopedState(false)

  const applyBulkMutationSuccesses = useCallback((
    results: readonly { status: string; habitId: string }[],
    mode: HabitResolutionMode,
    date: string,
  ) => {
    const resolutions = results.flatMap((item) =>
      item.status === 'Success' ? [{ habitId: item.habitId, mode }] : [],
    )
    if (resolutions.length === 0) return
    habitListRef.current?.settleBulkHabitResolutions(resolutions, date)
  }, [habitListRef])

  const finish = useCallback((outcome: BulkActionOutcome, retry: (ids: string[]) => void) => {
    const { retryIds, reasonKeys } = getBulkActionFailures(outcome.results)
    if (outcome.ambiguousIds?.length) {
      showToast(t('habits.bulkBar.connectionRefreshed'))
    }
    if (retryIds.length === 0) onSuccess()
    else onPartialFailure(retryIds)
    const messages = reasonKeys.map((key) => t(key))
    if (retryIds.length > 0) messages.push(t('habits.bulkBar.partialFailure', { count: retryIds.length }))
    if (messages.length === 0) return
    const message = messages.join('\n')
    if (retryIds.length === 0) showToast(message)
    else showQueued(message, t('habits.bulkBar.retryFailed'), () => retry(retryIds))
  }, [onPartialFailure, onSuccess, showQueued, showToast, t])

  async function executeDelete(ids: string[]) {
    if (ids.length === 0) return
    const accountGeneration = getAccountGeneration()
    try {
      const result = await bulkDelete.mutateAsync(ids)
      if (getAccountGeneration() !== accountGeneration) return
      finish(result, (failedIds) => {
        if (getAccountGeneration() === accountGeneration) void executeDelete(failedIds)
      })
    } catch (error) {
      if (getAccountGeneration() !== accountGeneration) return
      if (!reportAccountSwitch(error)) throw error
    } finally {
      setShowBulkDeleteConfirm(false)
    }
  }

  async function executeCompletion(ids: string[], mode: HabitResolutionMode) {
    if (!isBulkCompletionAllowed(currentPermission.current, selectedDateStr, accountTimeZone)) return
    if (ids.length === 0) return
    const date = selectedDateStr
    const accountGeneration = getAccountGeneration()
    try {
      const result = await (mode === 'log' ? bulkLog : bulkSkip).mutateAsync(
        ids.map((id) => ({ habitId: id, date })),
      )
      if (getAccountGeneration() !== accountGeneration) return
      applyBulkMutationSuccesses(result.results, mode, date)
      if (currentPermission.current.selectedDateStr !== date) return
      finish(result, (failedIds) => {
        if (getAccountGeneration() === accountGeneration) void executeCompletion(failedIds, mode)
      })
    } catch (error) {
      if (getAccountGeneration() !== accountGeneration) return
      if (!reportAccountSwitch(error)) throw error
    }
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
