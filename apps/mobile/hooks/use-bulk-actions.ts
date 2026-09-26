import { useState, useCallback, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatAPIDateInTimeZone, getTodayBoundary, type HabitResolutionMode } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { HabitListHandle } from '@/components/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  completionReadOnly: boolean
  accountTimeZone?: string | null
  habitsById: Map<string, NormalizedHabit>
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

interface BulkResultItem { status: string; habitId: string }

interface BulkActionOutcome {
  results: readonly BulkResultItem[]
  ambiguousIds?: readonly string[]
  offlineFailureIds?: readonly string[]
}

function failedHabitIds(results: readonly BulkResultItem[]): string[] {
  return results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : [])
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  completionReadOnly,
  accountTimeZone,
  habitListRef,
  onSuccess,
  onPartialFailure,
}: UseBulkActionsOptions) {
  const { t } = useTranslation()
  const { showToast } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()
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
      ...failedHabitIds(outcome.results),
      ...offlineFailureIds,
    ]))
    if (outcome.ambiguousIds?.length) {
      showToast({
        kind: 'neutral',
        message: t('habits.bulkBar.connectionRefreshed'),
      })
    }
    if (failedIds.length === 0) return onSuccess()
    onPartialFailure(failedIds)
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
    (results: readonly { status: string; habitId: string }[], mode: HabitResolutionMode, date: string) => {
      const resolutions = results.flatMap((item) =>
        item.status === 'Success' ? [{ habitId: item.habitId, mode }] : [],
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

  async function executeLog(ids: string[]) {
    if (currentPermission.current.completionReadOnly || currentPermission.current.selectedDateStr !== selectedDateStr) return
    if (accountTimeZone !== undefined && getTodayBoundary(selectedDateStr, formatAPIDateInTimeZone(new Date(), accountTimeZone)) === 'read-only') return
    if (ids.length === 0) return
    const date = selectedDateStr
    const result = await bulkLog.mutateAsync(
      ids.map((habitId) => ({ habitId, date })),
    )
    applyBulkMutationSuccesses(result.results, 'log', date)
    if (currentPermission.current.selectedDateStr !== date) return
    finish(result, (failedIds) => void executeLog(failedIds))
  }

  async function executeSkip(ids: string[]) {
    if (currentPermission.current.completionReadOnly || currentPermission.current.selectedDateStr !== selectedDateStr) return
    if (accountTimeZone !== undefined && getTodayBoundary(selectedDateStr, formatAPIDateInTimeZone(new Date(), accountTimeZone)) === 'read-only') return
    if (ids.length === 0) return
    const date = selectedDateStr
    const result = await bulkSkip.mutateAsync(
      ids.map((habitId) => ({ habitId, date })),
    )
    applyBulkMutationSuccesses(result.results, 'skip', date)
    if (currentPermission.current.selectedDateStr !== date) return
    finish(result, (failedIds) => void executeSkip(failedIds))
  }

  const confirmBulkDelete = () => executeDelete(Array.from(selectedHabitIds))

  const confirmBulkLog = () => executeLog(Array.from(selectedHabitIds))

  const confirmBulkSkip = () => executeSkip(Array.from(selectedHabitIds))

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  }
}
