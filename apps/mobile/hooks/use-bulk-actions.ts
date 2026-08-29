import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasAncestorInSet } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { HabitListHandle } from '@/components/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
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

export function useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess, onPartialFailure }: UseBulkActionsOptions) {
  const { t } = useTranslation()
  const { showToast } = useAppToast()
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  function promptParentLogs(successIds: string[]) {
    const successIdSet = new Set(successIds)
    for (const id of successIds) {
      if (!hasAncestorInSet(id, habitsById, successIdSet)) habitListRef.current?.checkAndPromptParentLog(id)
    }
  }

  function finish(outcome: BulkActionOutcome, retry: (ids: string[]) => void) {
    const failedIds = failedHabitIds(outcome.results)
    if (outcome.ambiguousIds?.length) {
      showToast({
        kind: 'neutral',
        message: t('habits.bulkBar.connectionRefreshed'),
      })
    }
    if (failedIds.length === 0) return onSuccess()
    onPartialFailure(failedIds)
    showToast({
      kind: 'neutral',
      message: t('habits.bulkBar.partialFailure', { count: failedIds.length }),
      actionLabel: t('habits.bulkBar.retryFailed'),
      onAction: () => retry(failedIds),
    })
  }

  async function executeDelete(ids: string[]) {
    if (ids.length === 0) return
    try {
      const result = await bulkDelete.mutateAsync(ids)
      finish(result, (failedIds) => void executeDelete(failedIds))
    } finally {
      setShowBulkDeleteConfirm(false)
    }
  }

  async function executeLog(ids: string[]) {
    if (ids.length === 0) return
    const result = await bulkLog.mutateAsync(ids.map((habitId) => ({ habitId })))
    const successIds = result.results.flatMap((item) => item.status === 'Success' ? [item.habitId] : [])
    for (const id of successIds) habitListRef.current?.markRecentlyCompleted(id)
    promptParentLogs(successIds)
    finish(result, (failedIds) => void executeLog(failedIds))
  }

  async function executeSkip(ids: string[]) {
    if (ids.length === 0) return
    const result = await bulkSkip.mutateAsync(ids.map((habitId) => ({ habitId })))
    const successIds = result.results.flatMap((item) => item.status === 'Success' ? [item.habitId] : [])
    for (const id of successIds) habitListRef.current?.markRecentlyCompleted(id)
    promptParentLogs(successIds)
    finish(result, (failedIds) => void executeSkip(failedIds))
  }

  return {
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    confirmBulkDelete: () => executeDelete(
      Array.from(selectedHabitIds).filter(
        (habitId) => !hasAncestorInSet(habitId, habitsById, selectedHabitIds),
      ),
    ),
    confirmBulkLog: () => executeLog(Array.from(selectedHabitIds)),
    confirmBulkSkip: () => executeSkip(Array.from(selectedHabitIds)),
  }
}
