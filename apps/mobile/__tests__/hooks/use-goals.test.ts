import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type { CreateGoalRequest, Goal, GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import {
  useCreateGoal,
  useDeleteGoal,
  useLinkHabitsToGoal,
  useReorderGoals,
  useRestoreGoal,
  useUpdateGoal,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
} from '@/hooks/use-goals'


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
    setGoalCompletedCelebration: vi.fn(),
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
      setGoalCompletedCelebration: mocks.setGoalCompletedCelebration,
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
    mocks.setGoalCompletedCelebration.mockClear()
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

    expect(mocks.state.lists[0]?.value[0]?.linkedHabits).toEqual([])
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.linkedHabits).toEqual([])
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

  it('optimistically edits a goal and its detail, then invalidates online', async () => {
    const mutation = useUpdateGoal() as unknown as MutationConfig<
      undefined,
      { goalId: string; data: { title: string; targetValue: number; unit: string } },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const variables = {
      goalId: 'goal-1',
      data: { title: 'Read 20 Books', targetValue: 20, unit: 'books' },
    }

    const context = await mutation.onMutate?.(variables)
    const listGoal = mocks.state.lists[0]?.value[0]
    const detail = mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))
    expect(listGoal?.title).toBe('Read 20 Books')
    expect(listGoal?.targetValue).toBe(20)
    expect(listGoal?.progressPercentage).toBe(15)
    expect(detail?.goal.targetValue).toBe(20)
    expect(detail?.metrics.progressPercentage).toBe(15)

    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)
    expect(mocks.invalidateGoalQueries).toHaveBeenCalledWith(expect.anything(), { goalId: 'goal-1' })
  })

  it('restores the goal and detail snapshots when an edit fails', async () => {
    const mutation = useUpdateGoal() as unknown as MutationConfig<
      undefined,
      { goalId: string; data: { title: string; targetValue: number; unit: string } },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >

    const variables = {
      goalId: 'goal-1',
      data: { title: 'Renamed', targetValue: 20, unit: 'books' },
    }

    const context = await mutation.onMutate?.(variables)
    mutation.onError?.(new Error('Edit failed'), variables, context)

    expect(mocks.state.lists[0]?.value[0]?.title).toBe('Read 12 Books')
    expect(mocks.state.lists[0]?.value[0]?.targetValue).toBe(12)
    expect(
      mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.targetValue,
    ).toBe(12)
  })

  it('marks a goal completed optimistically and celebrates only a named online completion', async () => {
    const mutation = useUpdateGoalStatus() as unknown as MutationConfig<
      undefined | { queued: true; queuedMutationId: string },
      { goalId: string; data: { status: string }; goalName?: string },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >

    const variables = { goalId: 'goal-1', data: { status: 'Completed' }, goalName: 'Read 12 Books' }
    const context = await mutation.onMutate?.(variables)

    expect(mocks.state.lists[0]?.value[0]?.status).toBe('Completed')
    expect(mocks.state.lists[0]?.value[0]?.progressPercentage).toBe(100)
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.status).toBe('Completed')

    mutation.onSuccess?.(undefined, variables, context)
    expect(mocks.setGoalCompletedCelebration).toHaveBeenCalledWith({ name: 'Read 12 Books' })

    mutation.onSuccess?.(
      { queued: true, queuedMutationId: 'mutation-1' },
      variables,
      context,
    )
    mutation.onSuccess?.(undefined, { goalId: 'goal-1', data: { status: 'Completed' } }, context)
    expect(mocks.setGoalCompletedCelebration).toHaveBeenCalledTimes(1)
  })

  it('restores the goal status snapshot when the status change fails', async () => {
    const mutation = useUpdateGoalStatus() as unknown as MutationConfig<
      undefined,
      { goalId: string; data: { status: string } },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >

    const variables = { goalId: 'goal-1', data: { status: 'Completed' } }
    const context = await mutation.onMutate?.(variables)
    mutation.onError?.(new Error('Status failed'), variables, context)

    expect(mocks.state.lists[0]?.value[0]?.status).toBe('Active')
    expect(mocks.state.lists[0]?.value[0]?.progressPercentage).toBe(25)
    expect(mocks.state.details.get(JSON.stringify(goalKeys.detail('goal-1')))?.goal.status).toBe('Active')
  })

  it('reorders goals by the supplied position map and restores them on failure', async () => {
    mocks.state.lists = [
      {
        key: goalKeys.lists(),
        value: [
          createMockGoal({ id: 'goal-1', position: 0 }),
          createMockGoal({ id: 'goal-2', position: 1 }),
        ],
      },
    ]

    const mutation = useReorderGoals() as unknown as MutationConfig<
      undefined,
      { id: string; position: number }[],
      { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[] }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const positions = [
      { id: 'goal-1', position: 1 },
      { id: 'goal-2', position: 0 },
    ]
    const context = await mutation.onMutate?.(positions)

    const byId = (id: string) => mocks.state.lists[0]?.value.find((goal) => goal.id === id)
    expect(byId('goal-1')?.position).toBe(1)
    expect(byId('goal-2')?.position).toBe(0)

    const result = await mutation.mutationFn(positions)
    mutation.onSettled?.(result, null, positions, context)
    expect(mocks.invalidateGoalQueries).toHaveBeenCalledTimes(1)

    mutation.onError?.(new Error('Reorder failed'), positions, context)
    expect(byId('goal-1')?.position).toBe(0)
    expect(byId('goal-2')?.position).toBe(1)
  })

  it('optimistically removes a goal from the list and restores it on failure', async () => {
    const mutation = useDeleteGoal() as unknown as MutationConfig<
      undefined,
      string,
      { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[] }
    >

    const context = await mutation.onMutate?.('goal-1')
    expect(mocks.state.lists[0]?.value).toEqual([])

    mutation.onError?.(new Error('Delete failed'), 'goal-1', context)
    expect(mocks.state.lists[0]?.value.map((goal) => goal.id)).toEqual(['goal-1'])
  })

  it('rolls back the optimistic temp goal when the create fails', async () => {
    const mutation = useCreateGoal() as unknown as MutationConfig<
      { id: string },
      CreateGoalRequest,
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        tempId: string
        request: CreateGoalRequest
      }
    >
    const request: CreateGoalRequest = { title: 'New goal', targetValue: 5, unit: 'reps' }

    const context = await mutation.onMutate?.(request)
    expect(mocks.state.lists[0]?.value.map((goal) => goal.id)).toEqual(['goal-1', 'offline-goal-1'])

    mutation.onError?.(new Error('Create failed'), request, context)
    expect(mocks.state.lists[0]?.value.map((goal) => goal.id)).toEqual(['goal-1'])
  })

  it('invalidates habit lists after linking habits confirms online', async () => {
    const mutation = useLinkHabitsToGoal() as unknown as MutationConfig<
      undefined,
      { goalId: string; habitIds: string[] },
      {
        previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[]
        previousDetail: GoalDetailWithMetrics | undefined
      }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const variables = { goalId: 'goal-1', habitIds: ['habit-1'] }
    const context = await mutation.onMutate?.(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    expect(mocks.invalidateGoalQueries).toHaveBeenCalledWith(expect.anything(), {
      goalId: 'goal-1',
      includeHabits: true,
    })
  })
})

type Executable<Variables> = { mutationFn: (variables: Variables) => Promise<unknown> }

describe('mobile goal hooks online execute closures', () => {
  beforeEach(() => {
    mocks.queueOrExecute.mockReset()
    mocks.queueOrExecute.mockImplementation(
      async ({ execute }: { execute: () => Promise<unknown> }) => execute(),
    )
    vi.mocked(apiClient).mockReset().mockResolvedValue(undefined)
  })

  it('POSTs to the create endpoint when executed online', async () => {
    vi.mocked(apiClient).mockResolvedValue({ id: 'goal-9' })
    const mutation = useCreateGoal() as unknown as Executable<CreateGoalRequest>
    await mutation.mutationFn({ title: 'Read', targetValue: 4, unit: 'books' })
    expect(apiClient).toHaveBeenCalledWith(API.goals.create, expect.objectContaining({ method: 'POST' }))
  })

  it('PUTs to the update endpoint when executed online', async () => {
    const mutation = useUpdateGoal() as unknown as Executable<{ goalId: string; data: CreateGoalRequest }>
    await mutation.mutationFn({ goalId: 'goal-1', data: { title: 'Read', targetValue: 6, unit: 'books' } })
    expect(apiClient).toHaveBeenCalledWith(API.goals.update('goal-1'), expect.objectContaining({ method: 'PUT' }))
  })

  it('POSTs to the restore endpoint when executed online', async () => {
    const mutation = useRestoreGoal() as unknown as Executable<string>
    await mutation.mutationFn('goal-1')
    expect(apiClient).toHaveBeenCalledWith(API.goals.restore('goal-1'), expect.objectContaining({ method: 'POST' }))
  })

  it('DELETEs the goal endpoint when executed online', async () => {
    const mutation = useDeleteGoal() as unknown as Executable<string>
    await mutation.mutationFn('goal-1')
    expect(apiClient).toHaveBeenCalledWith(API.goals.delete('goal-1'), expect.objectContaining({ method: 'DELETE' }))
  })

  it('PUTs the progress endpoint when executed online', async () => {
    const mutation = useUpdateGoalProgress() as unknown as Executable<{ goalId: string; data: { currentValue: number } }>
    await mutation.mutationFn({ goalId: 'goal-1', data: { currentValue: 3 } })
    expect(apiClient).toHaveBeenCalledWith(API.goals.progress('goal-1'), expect.objectContaining({ method: 'PUT' }))
  })

  it('PUTs the status endpoint when executed online', async () => {
    const mutation = useUpdateGoalStatus() as unknown as Executable<{ goalId: string; data: { status: string }; goalName?: string }>
    await mutation.mutationFn({ goalId: 'goal-1', data: { status: 'Completed' }, goalName: 'Read' })
    expect(apiClient).toHaveBeenCalledWith(API.goals.status('goal-1'), expect.objectContaining({ method: 'PUT' }))
  })

  it('PUTs the reorder endpoint when executed online', async () => {
    const mutation = useReorderGoals() as unknown as Executable<{ id: string; position: number }[]>
    await mutation.mutationFn([{ id: 'goal-1', position: 0 }])
    expect(apiClient).toHaveBeenCalledWith(API.goals.reorder, expect.objectContaining({ method: 'PUT' }))
  })

  it('PUTs the linked-habits endpoint when executed online', async () => {
    const mutation = useLinkHabitsToGoal() as unknown as Executable<{ goalId: string; habitIds: string[] }>
    await mutation.mutationFn({ goalId: 'goal-1', habitIds: ['habit-1'] })
    expect(apiClient).toHaveBeenCalledWith(API.goals.habits('goal-1'), expect.objectContaining({ method: 'PUT' }))
  })
})
