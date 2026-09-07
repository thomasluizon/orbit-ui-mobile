import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { habitKeys, tagKeys } from '@orbit/shared/query'
import type { HabitScheduleItem, SuggestTagsResponse } from '@orbit/shared/types/habit'

import {
  useAssignTags,
  useCreateTag,
  useDeleteTag,
  useRestoreTag,
  useSuggestTags,
  useTags,
  useUpdateTag,
} from '@/hooks/use-tags'

const mocks = vi.hoisted(() => {
  const state = {
    tags: [] as {
      key: readonly unknown[]
      value: { id: string; name: string; color: string }[]
    }[],
    habits: [] as { key: readonly unknown[]; value: HabitScheduleItem[] }[],
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
      const apply = <T,>(entries: { key: readonly unknown[]; value: T[] }[]) => (
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
          existing.value = value as { id: string; name: string; color: string }[]
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
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndoToast: vi.fn(),
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
  onSuccess?: (data: TResult, variables: TVariables, context: TContext) => void
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
    mocks.showSuccess.mockClear()
    mocks.showError.mockClear()
    mocks.showUndoToast.mockClear()
  })

  it('optimistically assigns tags to a habit and skips invalidation when queued', async () => {
    const mutation = useAssignTags() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { habitId: string; tagIds: string[] },
      { previousHabitLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[] }
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

  it('requests AI tag suggestions through the online api client', async () => {
    const { apiClient } = await import('@/lib/api-client')
    const response: SuggestTagsResponse = {
      tags: [
        { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-1' },
        { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
      ],
    }
    vi.mocked(apiClient).mockResolvedValue(response)

    const mutation = useSuggestTags() as unknown as MutationConfig<
      SuggestTagsResponse,
      { title: string; description: string | null; language: string },
      unknown
    >

    const result = await mutation.mutationFn({
      title: 'Morning run',
      description: null,
      language: 'en',
    })

    expect(apiClient).toHaveBeenCalledWith(API.tags.suggest, {
      method: 'POST',
      body: JSON.stringify({ title: 'Morning run', description: null, language: 'en' }),
    })
    expect(result).toEqual(response)
  })

  it('restores both tag and habit caches when deleting a tag fails', async () => {
    const mutation = useDeleteTag() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      {
        previousLists: readonly (readonly [readonly unknown[], { id: string; name: string; color: string }[] | undefined])[]
        previousHabitLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
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

  it('exposes the tag list query and fetches through the api client', async () => {
    const { apiClient } = await import('@/lib/api-client')
    mocks.useQuery.mockReturnValue({
      data: [{ id: 'tag-1', name: 'Health', color: '#00ff00' }],
      isLoading: false,
      isFetching: true,
    })

    const result = useTags()

    expect(result.tags).toEqual([{ id: 'tag-1', name: 'Health', color: '#00ff00' }])
    expect(result.isFetching).toBe(true)

    const options = mocks.useQuery.mock.calls[0]![0] as { queryFn: () => Promise<unknown> }
    await options.queryFn()
    expect(apiClient).toHaveBeenCalledWith(API.tags.list)
  })

  it('optimistically appends a created tag then swaps its temp id for the server id', async () => {
    const mutation = useCreateTag() as unknown as MutationConfig<
      { id: string },
      { name: string; color: string },
      { previousLists: unknown; tempId?: string; request: { name: string; color: string } }
    >
    mocks.queueOrExecute.mockResolvedValue({ id: 'server-tag-9' })

    const variables = { name: 'Reading', color: '#7c3aed' }
    const context = await mutation.onMutate!(variables)

    expect(mocks.state.tags[0]?.value.map((tag) => tag.id)).toContain('offline-tag-1')
    expect(context.tempId).toBe('offline-tag-1')

    const result = await mutation.mutationFn(variables)
    mutation.onSuccess!(result, variables, context)
    mutation.onSettled?.(result, null, variables, context)

    const ids = mocks.state.tags[0]?.value.map((tag) => tag.id)
    expect(ids).toContain('server-tag-9')
    expect(ids).not.toContain('offline-tag-1')
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled()
  })

  it('keeps the optimistic temp id and skips invalidation when a create is queued offline', async () => {
    const mutation = useCreateTag() as unknown as MutationConfig<
      { id: string; queued: true; queuedMutationId: string },
      { name: string; color: string },
      { previousLists: unknown; tempId?: string; request: { name: string; color: string } }
    >
    mocks.queueOrExecute.mockResolvedValue({
      id: 'offline-tag-1',
      queued: true,
      queuedMutationId: 'mutation-1',
    })

    const variables = { name: 'Reading', color: '#7c3aed' }
    const context = await mutation.onMutate!(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSuccess!(result, variables, context)
    mutation.onSettled?.(result, null, variables, context)

    expect(mocks.state.tags[0]?.value.map((tag) => tag.id)).toContain('offline-tag-1')
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('optimistically renames a tag across the tag list and every habit reference', async () => {
    const mutation = useUpdateTag() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { tagId: string; name: string; color: string },
      { previousLists: unknown; previousHabitLists: unknown }
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: true, queuedMutationId: 'mutation-1' })

    const variables = { tagId: 'tag-1', name: 'Wellbeing', color: '#123456' }
    const context = await mutation.onMutate!(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    const renamedTag = mocks.state.tags[0]?.value.find((tag) => tag.id === 'tag-1')
    expect(renamedTag).toEqual({ id: 'tag-1', name: 'Wellbeing', color: '#123456' })
    const habitTag = mocks.state.habits[0]?.value[0]?.tags?.find((tag) => tag.id === 'tag-1')
    expect(habitTag).toMatchObject({ name: 'Wellbeing', color: '#123456' })
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('rolls back the optimistic rename when the update fails', async () => {
    const mutation = useUpdateTag() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      { tagId: string; name: string; color: string },
      {
        previousLists: readonly (readonly [readonly unknown[], { id: string; name: string; color: string }[] | undefined])[]
        previousHabitLists: readonly (readonly [readonly unknown[], HabitScheduleItem[] | undefined])[]
      }
    >
    const initialTags = mocks.state.tags[0]?.value
    mocks.queueOrExecute.mockRejectedValue(new Error('Update failed'))

    const variables = { tagId: 'tag-1', name: 'Wellbeing', color: '#123456' }
    const context = await mutation.onMutate!(variables)
    await expect(mutation.mutationFn(variables)).rejects.toThrow('Update failed')
    mutation.onError?.(new Error('Update failed'), variables, context)

    expect(mocks.state.tags[0]?.value).toEqual(initialTags)
  })

  it('confirms a restore with a success toast and reports failures', async () => {
    const mutation = useRestoreTag() as unknown as MutationConfig<
      { queued: true; queuedMutationId: string },
      string,
      undefined
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: false })

    const result = await mutation.mutationFn('tag-1')
    mutation.onSuccess!(result, 'tag-1', undefined)
    expect(mocks.showSuccess).toHaveBeenCalledWith('undo.restored')

    mutation.onError?.(new Error('Restore failed'), 'tag-1', undefined)
    expect(mocks.showError).toHaveBeenCalledWith('undo.restoreFailed')
  })

  it('shows an undo toast after a delete and invalidates once settled online', async () => {
    const mutation = useDeleteTag() as unknown as MutationConfig<
      { queued: false },
      string,
      { previousLists: unknown; previousHabitLists: unknown }
    >
    mocks.queueOrExecute.mockResolvedValue({ queued: false })

    const context = await mutation.onMutate!('tag-1')
    expect(mocks.state.tags[0]?.value.map((tag) => tag.id)).not.toContain('tag-1')

    const result = await mutation.mutationFn('tag-1')
    mutation.onSuccess!(result, 'tag-1', context)
    mutation.onSettled?.(result, null, 'tag-1', context)

    expect(mocks.showUndoToast).toHaveBeenCalledWith('undo.tagDeleted', expect.any(Function))
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled()
  })

  it('invalidates habit lists after an online tag assignment settles', async () => {
    const mutation = useAssignTags() as unknown as MutationConfig<
      undefined,
      { habitId: string; tagIds: string[] },
      { previousHabitLists: unknown }
    >
    mocks.queueOrExecute.mockResolvedValue(undefined)

    const variables = { habitId: 'habit-1', tagIds: ['tag-2'] }
    const context = await mutation.onMutate!(variables)
    const result = await mutation.mutationFn(variables)
    mutation.onSettled?.(result, null, variables, context)

    expect(mocks.state.habits[0]?.value[0]?.tags).toEqual([
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalled()
  })
})
