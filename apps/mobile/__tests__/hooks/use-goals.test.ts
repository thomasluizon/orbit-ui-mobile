import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type { CreateGoalRequest, Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

import { API } from '@orbit/shared/api'
import { useCreateGoal , useDeleteGoal, useLinkHabitsToGoal, useRestoreGoal, useUpdateGoalProgress } from '@/hooks/use-goals'


const mocks = vi.hoisted(() => {
  const state = {
    lists: [] as { key: readonly unknown[]; value: Goal[] }[],
    details: new Map<string, GoalDetailWithMetrics | undefined>(),
    habits: [] as { key: readonly unknown[]; value: HabitScheduleItem[] }[],
  }

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueriesData: vi.fn((filters: { queryKey: readonly unknown[] }) => {
      if (JSON.stringify(filters.queryKey) === JSON.stringify(habitKeys.lists())) {
        return state.habits.map((entry) => [entry.key, entry.value] as const)
      }

      return state.lists.map((entry) => [entry.key, entry.value] as const)
    }),
    setQueriesData: vi.fn(
      (
        filters: { queryKey: readonly unknown[] },
        updater: Goal[] | ((old: Goal[] | undefined) => Goal[] | undefined),
      ) => {
        if (JSON.stringify(filters.queryKey) === JSON.stringify(habitKeys.lists())) {
          return
        }
        state.lists = state.lists.map((entry) => ({
          ...entry,
          value: typeof updater === 'function' ? updater(entry.value) ?? entry.value : updater,
        }))
      },
    ),
    setQueryData: vi.fn((queryKey: readonly unknown[], updater: unknown) => {
      const listIndex = state.lists.findIndex(
        (entry) => JSON.stringify(entry.key) === JSON.stringify(queryKey),
      )
      if (listIndex >= 0) {
        const current = state.lists[listIndex]
        if (!current) {
          return
        }
        state.lists[listIndex] = {
          ...current,
          value: typeof updater === 'function'
            ? (updater as (old: Goal[] | undefined) => Goal[] | undefined)(current.value) ?? current.value
            : updater as Goal[],
        }
        return
      }

      const detailKey = JSON.stringify(queryKey)
      const current = state.details.get(detailKey)
      state.details.set(
        detailKey,
        typeof updater === 'function'
          ? (updater as (old: GoalDetailWithMetrics | undefined) => GoalDetailWithMetrics | undefined)(current)
          : updater as GoalDetailWithMetrics | undefined,
      )
    }),
    getQueryData: vi.fn((queryKey: readonly unknown[]) => state.details.get(JSON.stringify(queryKey))),
  }

  return {
    state,
    queryClient,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => config),
    buildQueuedMutation: vi.fn((options) => ({
      id: 'mutation-1',
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      dependsOn: [],
      lastError: null,
      entityType: null,
      targetEntityId: null,
      clientEntityId: null,
      dedupeKey: null,
      ...options,
    })),
    createTempEntityId: vi.fn(() => 'offline-goal-1'),
    createQueuedAck: vi.fn(),
    isQueuedResult: vi.fn((value: unknown) => (
      typeof value === 'object' &&
      value !== null &&
      'queued' in value &&
      (value as { queued?: boolean }).queued === true
    )),
    queueOrExecute: vi.fn(),
    withQueuedMarker: vi.fn((value: Record<string, unknown>, mutationId: string) => ({
      ...value,
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    invalidateGoalQueries: vi.fn(async () => {}),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndoToast: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: mocks.buildQueuedMutation,
  createTempEntityId: mocks.createTempEntityId,
  createQueuedAck: mocks.createQueuedAck,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
  withQueuedMarker: mocks.withQueuedMarker,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: {
    getState: () => ({
      setGoalCompletedCelebration: vi.fn(),
    }),
  },
}))

vi.mock('@/lib/goal-mutation-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/goal-mutation-helpers')>(
    '@/lib/goal-mutation-helpers',
  )

  return {
    ...actual,
    invalidateGoalQueries: mocks.invalidateGoalQueries,
  }
})

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showQueued: vi.fn(),
    showInfo: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-undo-toast', () => ({
  useUndoToast: () => mocks.showUndoToast,
}))

type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext
  onSuccess?: (data: TResult, variables: TVariables, context: TContext | undefined) => void
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
}

describe('mobile goal hooks', () => {
  beforeEach(() => {
    mocks.state.lists = [
      {
        key: goalKeys.lists(),
        value: [createMockGoal({ id: 'goal-1', position: 0 })],
      },
    ]
    mocks.state.details = new Map<string, GoalDetailWithMetrics | undefined>([
      [
        JSON.stringify(goalKeys.detail('goal-1')),
        {
          goal: {
            ...createMockGoal({ id: 'goal-1', position: 0 }),
            progressHistory: [],
          },
          metrics: {
            progressPercentage: 25,
            velocityPerDay: 0,
            projectedCompletionDate: null,
            daysToDeadline: null,
            trackingStatus: 'on_track',
            habitAdherence: [],
          },
        },
      ],
    ])
    mocks.state.habits = [
      {
        key: habitKeys.lists(),
        value: [
          {
            id: 'habit-1',
            title: 'Workout',
            description: null,
            frequencyUnit: 'Day',
            frequencyQuantity: 1,
            isBadHabit: false,
            isCompleted: false,
            isGeneral: false,
            isFlexible: false,
            days: [],
            dueDate: '2025-01-01',
            dueTime: null,
            dueEndTime: null,
            endDate: null,
            position: 0,
            checklistItems: [],
            createdAtUtc: '2025-01-01T00:00:00Z',
            scheduledDates: ['2025-01-01'],
            isOverdue: false,
            reminderEnabled: false,
            reminderTimes: [],
            scheduledReminders: [],
            slipAlertEnabled: false,
            tags: [],
            children: [],
            hasSubHabits: false,
            flexibleTarget: null,
            flexibleCompleted: null,
            linkedGoals: [],
            instances: [],
            searchMatches: null,
          },
        ],
      },
    ]
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueriesData.mockClear()
    mocks.queryClient.setQueriesData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.getQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.buildQueuedMutation.mockClear()
    mocks.createTempEntityId.mockClear()
    mocks.isQueuedResult.mockClear()
    mocks.queueOrExecute.mockReset()
    mocks.withQueuedMarker.mockClear()
    mocks.invalidateGoalQueries.mockClear()
    mocks.showSuccess.mockClear()
    mocks.showError.mockClear()
    mocks.showUndoToast.mockClear()
  })

  it('inserts an optimistic temp goal and skips invalidation when the create is queued', async () => {
    const mutation = useCreateGoal() as unknown as MutationConfig<
      { id: string; queued: true; queuedMutationId: string },
      CreateGoalRequest,
      { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]; tempId: string; request: CreateGoalRequest }
    >
    const request: CreateGoalRequest = {
      title: 'Workout',
      targetValue: 4,
      unit: 'sessions',
    }

    mocks.queueOrExecute.mockResolvedValue({
      id: 'offline-goal-1',
      queued: true,
      queuedMutationId: 'mutation-1',
    })

    const context = await mutation.onMutate?.(request)
    const result = await mutation.mutationFn(request)
    mutation.onSettled?.(result, null, request, context)

    expect(mocks.state.lists[0]?.value.map((goal) => goal.id)).toEqual([
      'goal-1',
      'offline-goal-1',
    ])
    expect(mocks.invalidateGoalQueries).not.toHaveBeenCalled()
  })

  it('reconciles the temp goal id after a successful online create and invalidates goal queries', async () => {
    const mutation = useCreateGoal() as unknown as MutationConfig<
      { id: string },
      CreateGoalRequest,
      { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]; tempId: string; request: CreateGoalRequest }
    >
    const request: CreateGoalRequest = {
      title: 'Workout',
      targetValue: 4,
      unit: 'sessions',
    }

    mocks.queueOrExecute.mockResolvedValue({ id: 'goal-2' })

    const context = await mutation.onMutate?.(request)
    const result = await mutation.mutationFn(request)
    mutation.onSuccess?.(result, request, context)
    mutation.onSettled?.(result, null, request, context)

    expect(mocks.state.lists[0]?.value.map((goal) => goal.id)).toEqual([
      'goal-1',
      'goal-2',
    ])
    expect(mocks.invalidateGoalQueries).toHaveBeenCalledTimes(1)
  })

  it('restores optimistic goal progress updates when the mutation fails', async () => {
    const mutation = useUpdateGoalProgress() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { goalId: string; data: { currentValue: number } },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >

    const variables = {
      goalId: 'goal-1',
      data: { currentValue: 8 },
    }

    const context = await mutation.onMutate?.(variables)
    expect(mocks.state.lists[0]?.value[0]?.currentValue).toBe(8)
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.currentValue).toBe(8)

    mutation.onError?.(new Error('Goal progress failed'), variables, context)

    expect(mocks.state.lists[0]?.value[0]?.currentValue).toBe(3)
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.currentValue).toBe(3)
  })

  it('optimistically links habits to a goal and restores the snapshot on failure', async () => {
    const mutation = useLinkHabitsToGoal() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { goalId: string; habitIds: string[] },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >

    const variables = {
      goalId: 'goal-1',
      habitIds: ['habit-1'],
    }

    const context = await mutation.onMutate?.(variables)
    expect(mocks.state.lists[0]?.value[0]?.linkedHabits).toEqual([
      { id: 'habit-1', title: 'Workout' },
    ])
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.linkedHabits).toEqual([
      { id: 'habit-1', title: 'Workout' },
    ])

    mutation.onError?.(new Error('Link failed'), variables, context)

    expect(mocks.state.lists[0]?.value[0]?.linkedHabits).toBeUndefined()
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.linkedHabits).toBeUndefined()
  })

  it('shows the undo snackbar when a goal delete succeeds', () => {
    const mutation = useDeleteGoal() as unknown as MutationConfig<unknown, string, undefined>

    mutation.onSuccess?.(undefined, 'goal-1', undefined)

    expect(mocks.showUndoToast).toHaveBeenCalledWith('undo.goalDeleted', expect.any(Function))
  })

  it('restores a goal through the queued path, targets the restore endpoint, and confirms', async () => {
    const mutation = useRestoreGoal() as unknown as MutationConfig<unknown, string, undefined>

    mocks.queueOrExecute.mockResolvedValue(undefined)

    const result = await mutation.mutationFn('goal-1')
    mutation.onSuccess?.(result, 'goal-1', undefined)
    mutation.onSettled?.(result, null, 'goal-1', undefined)

    expect(mocks.buildQueuedMutation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'restoreGoal',
      endpoint: API.goals.restore('goal-1'),
      method: 'POST',
    }))
    expect(mocks.showSuccess).toHaveBeenCalledWith('undo.restored')
    expect(mocks.invalidateGoalQueries).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error toast when a goal restore fails', () => {
    const mutation = useRestoreGoal() as unknown as MutationConfig<unknown, string, undefined>

    mutation.onError?.(new Error('boom'), 'goal-1', undefined)

    expect(mocks.showError).toHaveBeenCalledWith('undo.restoreFailed')
  })
})
