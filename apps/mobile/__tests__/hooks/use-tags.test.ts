import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { habitKeys, tagKeys } from '@orbit/shared/query'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

const mocks = vi.hoisted(() => {
  const state = {
    tags: [] as Array<{
      key: readonly unknown[]
      value: Array<{ id: string; name: string; color: string }>
    }>,
    habits: [] as Array<{ key: readonly unknown[]; value: HabitScheduleItem[] }>,
  }

  const queryClient = {
    cancelQueries: vi.fn(async () => {}),
    invalidateQueries: vi.fn(async () => {}),
    getQueriesData: vi.fn((filters: { queryKey: readonly unknown[] }) => {
      if (JSON.stringify(filters.queryKey) === JSON.stringify(tagKeys.lists())) {
        return state.tags.map((entry) => [entry.key, entry.value] as const)
      }

      return state.habits.map((entry) => [entry.key, entry.value] as const)
    }),
    setQueriesData: vi.fn((
      filters: { queryKey: readonly unknown[] },
      updater: unknown[] | ((old: unknown[] | undefined) => unknown[] | undefined),
    ) => {
      const apply = <T,>(entries: Array<{ key: readonly unknown[]; value: T[] }>) => (
        entries.map((entry) => ({
          ...entry,
          value: typeof updater === 'function'
            ? (updater(entry.value) as T[] | undefined) ?? entry.value
            : updater as T[],
        }))
      )

      if (JSON.stringify(filters.queryKey) === JSON.stringify(tagKeys.lists())) {
        state.tags = apply(state.tags)
        return
      }

      state.habits = apply(state.habits)
    }),
    setQueryData: vi.fn((queryKey: readonly unknown[], value: unknown) => {
      if (JSON.stringify(queryKey) === JSON.stringify(tagKeys.lists())) {
        const existing = state.tags.find((entry) => JSON.stringify(entry.key) === JSON.stringify(queryKey))
        if (existing) {
          existing.value = value as Array<{ id: string; name: string; color: string }>
        }
        return
      }

      const existing = state.habits.find((entry) => JSON.stringify(entry.key) === JSON.stringify(queryKey))
      if (existing) {
        existing.value = value as HabitScheduleItem[]
      }
    }),
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
    createQueuedAck: vi.fn((mutationId: string) => ({
      queued: true as const,
      queuedMutationId: mutationId,
    })),
    createTempEntityId: vi.fn(() => 'offline-tag-1'),
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
  createQueuedAck: mocks.createQueuedAck,
  createTempEntityId: mocks.createTempEntityId,
  isQueuedResult: mocks.isQueuedResult,
  queueOrExecute: mocks.queueOrExecute,
  withQueuedMarker: mocks.withQueuedMarker,
}))

import { useAssignTags, useDeleteTag } from '@/hooks/use-tags'

type MutationConfig<TResult, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TResult>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void
  onSettled?: (
    data: TResult | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void
}

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: overrides.id ?? 'habit-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    scheduledDates: overrides.scheduledDates ?? ['2025-01-01'],
    isOverdue: overrides.isOverdue ?? false,
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    slipAlertEnabled: overrides.slipAlertEnabled ?? false,
    tags: overrides.tags ?? [{ id: 'tag-1', name: 'Health', color: '#00ff00' }],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    flexibleTarget: overrides.flexibleTarget ?? null,
    flexibleCompleted: overrides.flexibleCompleted ?? null,
    linkedGoals: overrides.linkedGoals ?? [createMockGoal({ id: 'goal-1' })].map((goal) => ({
      id: goal.id,
      title: goal.title,
    })),
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

describe('mobile tag hooks', () => {
  beforeEach(() => {
    mocks.state.tags = [
      {
        key: tagKeys.lists(),
        value: [
          { id: 'tag-1', name: 'Health', color: '#00ff00' },
          { id: 'tag-2', name: 'Focus', color: '#0000ff' },
        ],
      },
    ]
    mocks.state.habits = [
      {
        key: habitKeys.lists(),
        value: [
          makeHabit(),
        ],
      },
    ]
    mocks.queryClient.cancelQueries.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.getQueriesData.mockClear()
    mocks.queryClient.setQueriesData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.useMutation.mockClear()
    mocks.buildQueuedMutation.mockClear()
    mocks.createQueuedAck.mockClear()
    mocks.createTempEntityId.mockClear()
    mocks.isQueuedResult.mockClear()
    mocks.queueOrExecute.mockReset()
    mocks.withQueuedMarker.mockClear()
  })

  it('optimistically assigns tags to a habit and skips invalidation when queued', async () => {
    const mutation = useAssignTags() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; tagIds: string[] },
      { previousHabitLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]> }
    >

    mocks.queueOrExecute.mockResolvedValue({
      queued: true,
      queuedMutationId: 'mutation-1',
    })

    const variables = { habitId: 'habit-1', tagIds: ['tag-2'] }
    const context = await mutation.onMutate?.(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    expect(mocks.state.habits[0]?.value[0]?.tags).toEqual([
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('restores both tag and habit caches when deleting a tag fails', async () => {
    const mutation = useDeleteTag() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      {
        previousLists: ReadonlyArray<readonly [readonly unknown[], Array<{ id: string; name: string; color: string }> | undefined]>
        previousHabitLists: ReadonlyArray<readonly [readonly unknown[], HabitScheduleItem[] | undefined]>
      }
    >
    const initialTags = mocks.state.tags[0]?.value
    const initialHabits = mocks.state.habits[0]?.value
    mocks.queueOrExecute.mockRejectedValue(new Error('Delete failed'))

    const context = await mutation.onMutate?.('tag-1')
    await expect(mutation.mutationFn('tag-1')).rejects.toThrow('Delete failed')
    mutation.onError?.(new Error('Delete failed'), 'tag-1', context)

    expect(mocks.state.tags[0]?.value).toEqual(initialTags)
    expect(mocks.state.habits[0]?.value).toEqual(initialHabits)
  })
})
