'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUpdateGoalStatus } from '@/hooks/use-goals'

interface GoalStatusActionsInput {
  goalId: string
  goalName: string | undefined
  goalCount: number | undefined
  goalUnit: string | undefined
  refetchDetail: () => void | Promise<unknown>
  /** Runs after an abandon or a reactivate is saved, so the detail can state the fact. */
  onStatusSaved?: (status: 'Abandoned' | 'Active') => void
}

/** Owns the drawer's goal-status mutations: mark completed, mark abandoned and reactivate. Each one is guarded
 *  against a double submit and shows its failure as a toast. */
export function useGoalStatusActions({
  goalId,
  goalName,
  goalCount,
  goalUnit,
  refetchDetail,
  onStatusSaved,
}: GoalStatusActionsInput) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const updateStatus = useUpdateGoalStatus()
  const isUpdatingStatus = updateStatus.isPending

  const markCompleted = useCallback(async () => {
    if (updateStatus.isPending) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Completed' },
        goalName,
        goalCount,
        goalUnit,
      })
      void refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalCount, goalId, goalName, goalUnit, refetchDetail, showError, translate, updateStatus])

  const markAbandoned = useCallback(async () => {
    if (updateStatus.isPending) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName,
      })
      void refetchDetail()
      onStatusSaved?.('Abandoned')
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goalName, onStatusSaved, refetchDetail, showError, translate, updateStatus])

  const reactivate = useCallback(async () => {
    if (updateStatus.isPending) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName,
      })
      void refetchDetail()
      onStatusSaved?.('Active')
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goalName, onStatusSaved, refetchDetail, showError, translate, updateStatus])

  return { markCompleted, markAbandoned, reactivate, isUpdatingStatus }
}
