'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { hasAncestorInSet, type HabitResolutionMode } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { HabitListHandle } from '@/components/habits/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  readOnly: boolean
  habitsById: Map<string, NormalizedHabit>
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

interface BulkResultItem { status: string; habitId: string }

interface BulkActionOutcome {
  results: readonly BulkResultItem[]
  ambiguousIds?: readonly string[]
}

function failedHabitIds(results: readonly BulkResultItem[]): string[] {
  return results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : [])
}

export function useBulkActions({
  selectedHabitIds,
  selectedDateStr,
  readOnly,
  habitsById,
  habitListRef,
  onSuccess,
  onPartialFailure,
}: UseBulkActionsOptions) {
  const t = useTranslations()
  const { showToast, showQueued } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const applyBulkMutationSuccesses = useCallback((
    results: readonly { status: string; habitId: string }[],
    mode: HabitResolutionMode,
  ) => {
    const resolutions = results.flatMap((item) =>
      item.status === 'Success' ? [{ habitId: item.habitId, mode }] : [],
    )
    if (resolutions.length === 0) return
    habitListRef.current?.settleBulkHabitResolutions(resolutions)
  }, [habitListRef])

  const finish = useCallback((outcome: BulkActionOutcome, retry: (ids: string[]) => void) => {
    const failedIds = failedHabitIds(outcome.results)
    if (outcome.ambiguousIds?.length) {
      showToast(t('habits.bulkBar.connectionRefreshed'))
    }
    if (failedIds.length === 0) return onSuccess()
    onPartialFailure(failedIds)
    showQueued(
      t('habits.bulkBar.partialFailure', { count: failedIds.length }),
      t('habits.bulkBar.retryFailed'),
      () => retry(failedIds),
    )
  }, [onPartialFailure, onSuccess, showQueued, showToast, t])

  async function executeDelete(ids: string[]) {
    if (readOnly) return
    if (ids.length === 0) return
    try {
      const result = await bulkDelete.mutateAsync(ids)
      finish(result, (failedIds) => void executeDelete(failedIds))
    } finally {
      setShowBulkDeleteConfirm(false)
    }
  }

  async function executeLog(ids: string[]) {
    if (readOnly) return
    if (ids.length === 0) return
    const result = await bulkLog.mutateAsync(
      ids.map((id) => ({ habitId: id, date: selectedDateStr })),
    )
    applyBulkMutationSuccesses(result.results, 'log')
    finish(result, (failedIds) => void executeLog(failedIds))
  }

  async function executeSkip(ids: string[]) {
    if (readOnly) return
    if (ids.length === 0) return
    const result = await bulkSkip.mutateAsync(
      ids.map((id) => ({ habitId: id, date: selectedDateStr })),
    )
    applyBulkMutationSuccesses(result.results, 'skip')
    finish(result, (failedIds) => void executeSkip(failedIds))
  }

  const confirmBulkDelete = () => executeDelete(
    Array.from(selectedHabitIds).filter(
      (habitId) => !hasAncestorInSet(habitId, habitsById, selectedHabitIds),
    ),
  )

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
