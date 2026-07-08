'use client'

import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type {
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import {
  createGoal as createGoalAction,
  updateGoal as updateGoalAction,
  deleteGoal as deleteGoalAction,
  restoreGoal as restoreGoalAction,
  updateGoalProgress as updateGoalProgressAction,
  updateGoalStatus as updateGoalStatusAction,
  reorderGoals as reorderGoalsAction,
  linkHabitsToGoal as linkHabitsToGoalAction,
} from '@/app/actions/goals'
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

  return useMutation({
    mutationFn: (data: CreateGoalRequest) => createGoalAction(data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: UpdateGoalRequest }) =>
      updateGoalAction(goalId, data),

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

  return useMutation({
    mutationFn: (goalId: string) => restoreGoalAction(goalId),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreGoal = useRestoreGoal()
  const showUndoToast = useUndoToast()

  return useMutation({
    mutationFn: (goalId: string) => deleteGoalAction(goalId),

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

  return useMutation({
    mutationFn: ({
      goalId,
      data,
    }: {
      goalId: string
      data: UpdateGoalProgressRequest
    }) => updateGoalProgressAction(goalId, data),

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

  return useMutation({
    mutationFn: ({
      goalId,
      data,
    }: {
      goalId: string
      data: UpdateGoalStatusRequest
      goalName?: string
    }) => updateGoalStatusAction(goalId, data),

    onSuccess: (_data, { data, goalName }) => {
      if (data.status === 'Completed' && goalName) {
        setGoalCompletedCelebration({ name: goalName })
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

  return useMutation({
    mutationFn: (positions: GoalPositionItem[]) => reorderGoalsAction(positions),

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

  return useMutation({
    mutationFn: ({
      goalId,
      habitIds,
    }: {
      goalId: string
      habitIds: string[]
    }) => linkHabitsToGoalAction(goalId, habitIds),

    onSettled: (_data, _err, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}
