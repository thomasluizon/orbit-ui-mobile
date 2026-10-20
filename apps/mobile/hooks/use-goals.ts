import { getGoalProgressCelebration, getGoalStatusCelebration, type GoalMutationInput } from '@orbit/shared/utils'
import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { goalKeys, habitKeys, goalListRollback, goalDetailRollback, goalDetailSettled, removeGoalFromCache, reorderGoalCache, updateGoalCache } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import {
  buildTempGoal,
  writeQueuedGoalChange,
  findLinkedHabits,
  invalidateGoalQueries,
  nextGoalPosition,
  restoreGoalLists,
  sortGoalsByPosition,
} from '@/lib/goal-mutation-helpers'
import {
  buildQueuedMutation,
  cancelQueuedDeleteForUndo,
  createQueuedAck,
  createTempEntityId,
  isQueuedResult,
  queueOrExecute,
  type QueuedMarker,
  withQueuedMarker,
} from '@/lib/offline-mutations'
import { useUIStore } from '@/stores/ui-store'
import { useTranslation } from 'react-i18next'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'

const pendingCreateGoalIds = new WeakMap<CreateGoalRequest, string>()
export {
  type NormalizedGoalsData,
  useGoalDetail,
  useGoalMetrics,
  useGoals,
} from './use-goal-queries'

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateGoalRequest) => {
      const tempId = pendingCreateGoalIds.get(data) ?? createTempEntityId('goal')
      const mutation = buildQueuedMutation({
        type: 'createGoal',
        scope: 'goals',
        endpoint: API.goals.create,
        method: 'POST',
        payload: data,
        entityType: 'goal',
        clientEntityId: tempId,
      })

      return queueOrExecute({
        mutation,
        execute: async (resolvedMutation) => apiClient<{ id: string }>(API.goals.create, {
          method: 'POST',
          body: JSON.stringify(resolvedMutation.payload),
        }),
        queuedResult: withQueuedMarker({ id: tempId }, mutation.id),
      })
    },

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const tempId = createTempEntityId('goal')
      pendingCreateGoalIds.set(data, tempId)
      const nextGoal = { ...buildTempGoal(data, tempId, 999999), linkedHabits: findLinkedHabits(queryClient, data.habitIds ?? []) }

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          const position = nextGoalPosition(old)
          return [...old, { ...nextGoal, position }].sort(sortGoalsByPosition)
        },
      )

      return { previousLists, tempId, request: data }
    },

    onError: (_err, _data, context) => {
      if (context?.request) {
        pendingCreateGoalIds.delete(context.request)
      }
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
    },

    onSuccess: (result, _data, context) => {
      pendingCreateGoalIds.delete(context.request)
      if (isQueuedResult(result)) return
      if (!context.tempId) return

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((goal) =>
            goal.id === context.tempId
              ? {
                  ...buildTempGoal(context.request, result.id, goal.position),
                  linkedHabits: goal.linkedHabits,
                  createdAtUtc: goal.createdAtUtc,
                  position: goal.position,
                }
              : goal,
          )
        },
      )
    },

    onSettled: async (data) => {
      if (isQueuedResult(data)) return
      await invalidateGoalQueries(queryClient, { includeHabits: true })
      await queryClient.invalidateQueries({ queryKey: habitKeys.details() })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: UpdateGoalRequest }) => writeQueuedGoalChange('updateGoal', goalId, data),

    onMutate: ({ goalId, data }) => updateGoalCache(queryClient, goalId, { type: 'update', request: data }),

    onError: goalDetailRollback(queryClient),

    onSettled: (data, _err, { goalId }) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient, { goalId })
    },
  })
}

export function useRestoreGoal() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { showSuccess, showError } = useAppToast()

  return useMutation({
    mutationFn: async (goalId: string) => {
      const mutation = buildQueuedMutation({
        type: 'restoreGoal',
        scope: 'goals',
        endpoint: API.goals.restore(goalId),
        method: 'POST',
        payload: null,
        entityType: 'goal',
        targetEntityId: goalId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.restore(goalId), { method: 'POST' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onSuccess: () => {
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreGoal = useRestoreGoal()
  const showUndoToast = useUndoToast()

  return useMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[] }
  >({
    mutationFn: async (goalId: string) => {
      const mutation = buildQueuedMutation({
        type: 'deleteGoal',
        scope: 'goals',
        endpoint: API.goals.delete(goalId),
        method: 'DELETE',
        payload: null,
        entityType: 'goal',
        targetEntityId: goalId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.delete(goalId), { method: 'DELETE' }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onSuccess: (data, goalId, context) => {
      showUndoToast(t('undo.goalDeleted'), () => {
        if (isQueuedResult(data)) {
          void cancelQueuedDeleteForUndo(data.queuedMutationId).then((outcome) => {
            if (outcome !== 'replayed') {
              restoreGoalLists(queryClient, context.previousLists)
              void invalidateGoalQueries(queryClient)
            }
            if (outcome === 'replayed' || outcome === 'uncertain') restoreGoal.mutate(goalId)
          })
          return
        }
        restoreGoal.mutate(goalId)
      }, isQueuedResult(data) ? data.queuedMutationId : undefined)
    },

    onMutate: (goalId) => removeGoalFromCache(queryClient, goalId),

    onError: goalListRollback(queryClient),

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useMutation({
    mutationFn: ({ goalId, data }: GoalMutationInput<UpdateGoalProgressRequest>) => writeQueuedGoalChange('updateGoalProgress', goalId, data),

    onSuccess: (result, input) => {
      if (isQueuedResult(result)) return
      const celebration = getGoalProgressCelebration(input)
      if (celebration) setGoalCompletedCelebration(celebration)
    },

    onMutate: ({ goalId, data }) => updateGoalCache(queryClient, goalId, { type: 'progress', currentValue: data.currentValue }),

    onError: goalDetailRollback(queryClient),

    onSettled: goalDetailSettled(queryClient, isQueuedResult),
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useMutation({
    mutationFn: ({ goalId, data }: GoalMutationInput<UpdateGoalStatusRequest>) => writeQueuedGoalChange('updateGoalStatus', goalId, data),

    onSuccess: (result, input) => {
      if (isQueuedResult(result)) return
      const celebration = getGoalStatusCelebration(input)
      if (celebration) setGoalCompletedCelebration(celebration)
    },

    onMutate: ({ goalId, data }) => updateGoalCache(queryClient, goalId, { type: 'status', status: data.status }),

    onError: goalDetailRollback(queryClient),

    onSettled: goalDetailSettled(queryClient, isQueuedResult),
  })
}

export function useReorderGoals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (positions: GoalPositionItem[]) => {
      const mutation = buildQueuedMutation({
        type: 'reorderGoals',
        scope: 'goals',
        endpoint: API.goals.reorder,
        method: 'PUT',
        payload: { positions },
        dedupeKey: 'reorderGoals',
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.reorder, {
          method: 'PUT',
          body: JSON.stringify({ positions }),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: (positions) => reorderGoalCache(queryClient, positions),

    onError: goalListRollback(queryClient),

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}
