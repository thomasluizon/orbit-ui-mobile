import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { goalKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  Goal,
  GoalDetailWithMetrics,
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'
import {
  buildTempGoal,
  findLinkedHabits,
  invalidateGoalQueries,
  nextGoalPosition,
  restoreGoalLists,
  restoreGoalDetail,
  sortGoalsByPosition,
  updateGoalDetailItem,
  updateGoalLinkedHabitsDetail,
  updateGoalLinkedHabitsItem,
  updateGoalListItem,
  updateGoalProgressDetail,
  updateGoalProgressItem,
  updateGoalStatusDetail,
  updateGoalStatusItem,
} from '@/lib/goal-mutation-helpers'
import {
  buildQueuedMutation,
  createQueuedAck,
  createTempEntityId,
  isQueuedResult,
  queueOrExecute,
  withQueuedMarker,
} from '@/lib/offline-mutations'
import { useUIStore } from '@/stores/ui-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pendingCreateGoalIds = new WeakMap<CreateGoalRequest, string>()
export {
  type NormalizedGoalsData,
  useGoalDetail,
  useGoalMetrics,
  useGoals,
} from './use-goal-queries'

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

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
        execute: async () => apiClient<{ id: string }>(API.goals.create, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
        queuedResult: withQueuedMarker({ id: tempId }, mutation.id),
      })
    },

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const tempId = createTempEntityId('goal')
      pendingCreateGoalIds.set(data, tempId)
      const nextGoal = buildTempGoal(data, tempId, 999999)

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
      if (context?.request) {
        pendingCreateGoalIds.delete(context.request)
      }
      if (isQueuedResult(result)) return
      if (!context?.tempId) return

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((goal) =>
            goal.id === context.tempId
              ? {
                  ...buildTempGoal(context.request, result.id, goal.position),
                  createdAtUtc: goal.createdAtUtc,
                  position: goal.position,
                }
              : goal,
          )
        },
      )
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ goalId, data }: { goalId: string; data: UpdateGoalRequest }) => {
      const mutation = buildQueuedMutation({
        type: 'updateGoal',
        scope: 'goals',
        endpoint: API.goals.update(goalId),
        method: 'PUT',
        payload: data,
        entityType: 'goal',
        targetEntityId: goalId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.update(goalId), {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async ({ goalId, data }) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((goal) => (goal.id === goalId ? updateGoalListItem(goal, data) : goal))
        },
      )
      queryClient.setQueryData<GoalDetailWithMetrics | undefined>(
        goalKeys.detail(goalId),
        (old) => updateGoalDetailItem(old, data),
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(goalKeys.detail(context.previousDetail.goal.id), context.previousDetail)
      }
    },

    onSettled: (data, _err, { goalId }) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient, { goalId })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()

  return useMutation({
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

    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      // Optimistic: remove goal from cache
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
        restoreGoalLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      goalId,
      data,
    }: {
      goalId: string
      data: UpdateGoalProgressRequest
    }) => {
      const mutation = buildQueuedMutation({
        type: 'updateGoalProgress',
        scope: 'goals',
        endpoint: API.goals.progress(goalId),
        method: 'PUT',
        payload: data,
        entityType: 'goal',
        targetEntityId: goalId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.progress(goalId), {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async ({ goalId, data }) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((goal) =>
            goal.id === goalId
              ? updateGoalProgressItem(goal, data.currentValue)
              : goal,
          )
        },
      )
      queryClient.setQueryData<GoalDetailWithMetrics | undefined>(
        goalKeys.detail(goalId),
        (old) => updateGoalProgressDetail(old, data.currentValue),
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, { goalId }, context) => {
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
      restoreGoalDetail(queryClient, goalId, context?.previousDetail)
    },

    onSettled: (data, _err, { goalId }) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient, { goalId, includeMetrics: true })
    },
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useMutation({
    mutationFn: async ({
      goalId,
      data,
      goalName,
    }: {
      goalId: string
      data: UpdateGoalStatusRequest
      goalName?: string
    }) => {
      const mutation = buildQueuedMutation({
        type: 'updateGoalStatus',
        scope: 'goals',
        endpoint: API.goals.status(goalId),
        method: 'PUT',
        payload: data,
        entityType: 'goal',
        targetEntityId: goalId,
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.status(goalId), {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onSuccess: (result, { data, goalName }) => {
      if (!isQueuedResult(result) && data.status === 'Completed' && goalName) {
        setGoalCompletedCelebration({ name: goalName })
      }
    },

    onMutate: async ({ goalId, data }) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.map((goal) => (goal.id === goalId ? updateGoalStatusItem(goal, data.status) : goal))
        },
      )
      queryClient.setQueryData<GoalDetailWithMetrics | undefined>(
        goalKeys.detail(goalId),
        (old) => updateGoalStatusDetail(old, data.status),
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(goalKeys.detail(context.previousDetail.goal.id), context.previousDetail)
      }
    },

    onSettled: (data, _err, { goalId }) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient, { goalId, includeMetrics: true })
    },
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

    onMutate: async (positions) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      // Optimistic: update positions in cache
      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          const positionMap = new Map(positions.map((p) => [p.id, p.position]))
          return old.map((g) => {
            const newPos = positionMap.get(g.id)
            return newPos !== undefined ? { ...g, position: newPos } : g
          })
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient)
    },
  })
}

export function useLinkHabitsToGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      goalId,
      habitIds,
    }: {
      goalId: string
      habitIds: string[]
    }) => {
      const mutation = buildQueuedMutation({
        type: 'linkGoalHabits',
        scope: 'goals',
        endpoint: API.goals.habits(goalId),
        method: 'PUT',
        payload: { habitIds },
        entityType: 'goal',
        targetEntityId: goalId,
        dependsOn: habitIds.filter((habitId) => habitId.startsWith('offline-')),
      })

      return queueOrExecute({
        mutation,
        execute: async () => apiClient<void>(API.goals.habits(goalId), {
          method: 'PUT',
          body: JSON.stringify({ habitIds }),
        }),
        queuedResult: createQueuedAck(mutation.id),
      })
    },

    onMutate: async ({ goalId, habitIds }) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })
      await queryClient.cancelQueries({ queryKey: goalKeys.detail(goalId) })

      const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
      const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))
      const linkedHabits = findLinkedHabits(queryClient, habitIds)

      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => old?.map((goal) => (goal.id === goalId ? updateGoalLinkedHabitsItem(goal, linkedHabits) : goal)),
      )
      queryClient.setQueryData<GoalDetailWithMetrics | undefined>(
        goalKeys.detail(goalId),
        (old) => updateGoalLinkedHabitsDetail(old, linkedHabits),
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, { goalId }, context) => {
      if (context?.previousLists) {
        restoreGoalLists(queryClient, context.previousLists)
      }
      restoreGoalDetail(queryClient, goalId, context?.previousDetail)
    },

    onSettled: (data, _err, { goalId }) => {
      if (isQueuedResult(data)) return
      void invalidateGoalQueries(queryClient, { goalId, includeHabits: true })
    },
  })
}
