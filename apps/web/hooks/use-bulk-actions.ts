'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { hasAncestorInSet } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { HabitListHandle } from '@/components/habits/habit-list'

interface UseBulkActionsOptions {
  selectedHabitIds: Set<string>
  habitsById: Map<string, NormalizedHabit>
  habitListRef: React.RefObject<HabitListHandle | null>
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

interface BulkResultItem { status: string; habitId: string }

function failedHabitIds(results: readonly BulkResultItem[]): string[] {
  return results.flatMap((result) => result.status === 'Failed' ? [result.habitId] : [])
}

export function useBulkActions({ selectedHabitIds, habitsById, habitListRef, onSuccess, onPartialFailure }: UseBulkActionsOptions) {
  const t = useTranslations()
  const { showQueued } = useAppToast()
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

  function finish(results: readonly BulkResultItem[], retry: (ids: string[]) => void) {
    const failedIds = failedHabitIds(results)
    if (failedIds.length === 0) return onSuccess()
    onPartialFailure(failedIds)
    showQueued(t('habits.bulkBar.partialFailure', { count: failedIds.length }), t('habits.bulkBar.retryFailed'), () => retry(failedIds))
  }

  async function executeDelete(ids: string[]) {
    if (ids.length === 0) return
    try {
      const result = await bulkDelete.mutateAsync(ids)
      finish(result.results, (failedIds) => void executeDelete(failedIds))
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
    finish(result.results, (failedIds) => void executeLog(failedIds))
  }

  async function executeSkip(ids: string[]) {
    if (ids.length === 0) return
    const result = await bulkSkip.mutateAsync(ids.map((habitId) => ({ habitId })))
    const successIds = result.results.flatMap((item) => item.status === 'Success' ? [item.habitId] : [])
    for (const id of successIds) habitListRef.current?.markRecentlyCompleted(id)
    promptParentLogs(successIds)
    finish(result.results, (failedIds) => void executeSkip(failedIds))
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
