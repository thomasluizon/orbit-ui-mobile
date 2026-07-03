'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUpdateGoalStatus } from '@/hooks/use-goals'

interface GoalStatusActionsInput {
  goalId: string
  goalName: string | undefined
  refetchDetail: () => void
}

/** Owns the drawer's goal-status mutations — mark completed, mark abandoned,
 *  reactivate — each guarded against double-submit and surfacing failures as
 *  toasts. */
export function useGoalStatusActions({
  goalId,
  goalName,
  refetchDetail,
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
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Completed' },
        goalName,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goalName, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const markAbandoned = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goalName, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const reactivate = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goalName, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  return { markCompleted, markAbandoned, reactivate, isUpdatingStatus }
}
