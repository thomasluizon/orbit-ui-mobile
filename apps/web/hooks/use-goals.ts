'use client'

import { getGoalProgressCelebration, getGoalStatusCelebration, type GoalMutationInput } from '@orbit/shared/utils'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { goalKeys, habitKeys, goalListRollback, goalDetailRollback, goalDetailSettled, removeGoalFromCache, reorderGoalCache, updateGoalCache, invalidateGoalQueries } from '@orbit/shared/query'
import type {
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import {
  createGoal as createGoalAction,
  updateGoal as updateGoalAction,
  deleteGoal as deleteGoalAction,
  restoreGoal as restoreGoalAction,
  updateGoalProgress as updateGoalProgressAction,
  updateGoalStatus as updateGoalStatusAction,
  reorderGoals as reorderGoalsAction,
} from '@/lib/actions/goals'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useUIStore } from '@/stores/ui-store'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'
export {
  type NormalizedGoalsData,
  useGoalDetail,
  useGoalMetrics,
  useGoals,
} from './use-goal-queries'

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: CreateGoalRequest, intendedAccountId) =>
      createGoalAction(data, intendedAccountId),

    onSettled: async () => {
      await invalidateGoalQueries(queryClient, { includeHabits: true })
      await queryClient.invalidateQueries({ queryKey: habitKeys.details() })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: UpdateGoalRequest }, intendedAccountId) =>
      updateGoalAction(goalId, data, intendedAccountId),

    onSettled: (_data, _err, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
    },
  })
}

export function useRestoreGoal() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (goalId: string, intendedAccountId) => restoreGoalAction(goalId, intendedAccountId),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      showSuccess(t('undo.restored'))
    },

    onError: (error) => {
      showError(getFriendlyErrorMessage(error, t, 'undo.restoreFailed'))
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreGoal = useRestoreGoal()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: (goalId: string, intendedAccountId) => deleteGoalAction(goalId, intendedAccountId),

    onSuccess: (_data, goalId) => {
      showUndoToast(t('undo.goalDeleted'), () => restoreGoal.mutate(goalId))
    },

    onMutate: (goalId) => removeGoalFromCache(queryClient, goalId),

    onError: goalListRollback(queryClient),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useAccountScopedMutation({
    mutationFn: ({
      goalId,
      data,
    }: GoalMutationInput<UpdateGoalProgressRequest>, intendedAccountId) => updateGoalProgressAction(goalId, data, intendedAccountId),

    onSuccess: (_result, input) => {
      const celebration = getGoalProgressCelebration(input)
      if (celebration) setGoalCompletedCelebration(celebration)
    },

    onMutate: ({ goalId, data }) => updateGoalCache(queryClient, goalId, { type: 'progress', currentValue: data.currentValue }, true),

    onError: goalDetailRollback(queryClient),

    onSettled: goalDetailSettled(queryClient),
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useAccountScopedMutation({
    mutationFn: ({
      goalId,
      data,
    }: GoalMutationInput<UpdateGoalStatusRequest>, intendedAccountId) => updateGoalStatusAction(goalId, data, intendedAccountId),

    onSuccess: (_result, input) => {
      const celebration = getGoalStatusCelebration(input)
      if (celebration) setGoalCompletedCelebration(celebration)
    },

    onSettled: goalDetailSettled(queryClient),
  })
}

export function useReorderGoals() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (positions: GoalPositionItem[], intendedAccountId) =>
      reorderGoalsAction(positions, intendedAccountId),

    onMutate: (positions) => reorderGoalCache(queryClient, positions),

    onError: goalListRollback(queryClient),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}
