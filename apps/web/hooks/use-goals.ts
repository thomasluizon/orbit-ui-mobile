'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type {
  Goal,
  GoalDetailWithMetrics,
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import { getFriendlyErrorMessage, updateGoalProgressDetail, updateGoalProgressItem } from '@orbit/shared/utils'
import {
  createGoal as createGoalAction,
  updateGoal as updateGoalAction,
  deleteGoal as deleteGoalAction,
  restoreGoal as restoreGoalAction,
  updateGoalProgress as updateGoalProgressAction,
  updateGoalStatus as updateGoalStatusAction,
  reorderGoals as reorderGoalsAction,
  linkHabitsToGoal as linkHabitsToGoalAction,
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

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
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

    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.filter((g) => g.id !== goalId)
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

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
    }: {
      goalId: string
      data: UpdateGoalProgressRequest
      goalName?: string
      goalCount?: number
      goalUnit?: string
    }, intendedAccountId) => updateGoalProgressAction(goalId, data, intendedAccountId),

    onSuccess: (_data, { data, goalName, goalCount, goalUnit }) => {
      if (
        data.currentValue === goalCount &&
        goalName &&
        goalUnit !== undefined
      ) {
        setGoalCompletedCelebration({ name: goalName, count: goalCount, unit: goalUnit })
      }
    },

    onMutate: async ({ goalId, data }) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })
      await queryClient.cancelQueries({ queryKey: goalKeys.detail(goalId) })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => old?.map((goal) => (
          goal.id === goalId ? updateGoalProgressItem(goal, data.currentValue) : goal
        )),
      )
      queryClient.setQueryData<GoalDetailWithMetrics | undefined>(
        goalKeys.detail(goalId),
        (old) => updateGoalProgressDetail(old, data.currentValue),
      )

      return { previousLists, previousDetail }
    },

    onError: (_error, { goalId }, context) => {
      for (const [key, value] of context?.previousLists ?? []) {
        queryClient.setQueryData(key, value)
      }
      queryClient.setQueryData(goalKeys.detail(goalId), context?.previousDetail)
    },

    onSettled: (_data, _err, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      void queryClient.invalidateQueries({ queryKey: goalKeys.metrics(goalId) })
    },
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useAccountScopedMutation({
    mutationFn: ({
      goalId,
      data,
    }: {
      goalId: string
      data: UpdateGoalStatusRequest
      goalName?: string
      goalCount?: number
      goalUnit?: string
    }, intendedAccountId) => updateGoalStatusAction(goalId, data, intendedAccountId),

    onSuccess: (_data, { data, goalName, goalCount, goalUnit }) => {
      if (
        data.status === 'Completed' &&
        goalName &&
        goalCount !== undefined &&
        goalUnit !== undefined
      ) {
        setGoalCompletedCelebration({ name: goalName, count: goalCount, unit: goalUnit })
      }
    },

    onSettled: (_data, _err, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      void queryClient.invalidateQueries({ queryKey: goalKeys.metrics(goalId) })
    },
  })
}

export function useReorderGoals() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (positions: GoalPositionItem[], intendedAccountId) =>
      reorderGoalsAction(positions, intendedAccountId),

    onMutate: async (positions) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          const positionMap = new Map(positions.map((p) => [p.id, p.position]))
          return old.map((g) => {
            const newPos = positionMap.get(g.id)
            return newPos === undefined ? g : { ...g, position: newPos }
          })
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useLinkHabitsToGoal() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      goalId,
      habitIds,
    }: {
      goalId: string
      habitIds: string[]
    }, intendedAccountId) => linkHabitsToGoalAction(goalId, habitIds, intendedAccountId),

    onSettled: (_data, _err, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}
