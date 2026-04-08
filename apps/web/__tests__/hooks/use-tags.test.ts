import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { habitKeys, tagKeys } from '@orbit/shared/query'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { useAssignTags, useCreateTag, useDeleteTag, useUpdateTag } from '@/hooks/use-tags'

vi.mock('@/app/actions/tags', () => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  assignTags: vi.fn(),
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
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

describe('web tag hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a tag optimistically and remaps the temp id on success', async () => {
    const { createTag } = await import('@/app/actions/tags')
    vi.mocked(createTag).mockResolvedValue({ id: 'tag-2' })
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('temp-id')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(tagKeys.lists(), [{ id: 'tag-1', name: 'Health', color: '#00ff00' }])

    const { result } = renderHook(() => useCreateTag(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: 'Focus', color: '#0000ff' })
    })

    expect(queryClient.getQueryData(tagKeys.lists())).toEqual([
      { id: 'tag-1', name: 'Health', color: '#00ff00' },
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
  })

  it('updates tag names/colors across both tag and habit caches', async () => {
    const { updateTag } = await import('@/app/actions/tags')
    vi.mocked(updateTag).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(tagKeys.lists(), [{ id: 'tag-1', name: 'Health', color: '#00ff00' }])
    queryClient.setQueryData(habitKeys.lists(), [makeHabit()])

    const { result } = renderHook(() => useUpdateTag(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      result.current.mutate({ tagId: 'tag-1', name: 'Fitness', color: '#ff00ff' })
      await Promise.resolve()
    })

    expect(queryClient.getQueryData(tagKeys.lists())).toEqual([
      { id: 'tag-1', name: 'Fitness', color: '#ff00ff' },
    ])
    expect((queryClient.getQueryData(habitKeys.lists()) as HabitScheduleItem[])[0]?.tags).toEqual([
      { id: 'tag-1', name: 'Fitness', color: '#ff00ff' },
    ])
  })

  it('restores tag and habit caches when deleting a tag fails', async () => {
    const { deleteTag } = await import('@/app/actions/tags')
    vi.mocked(deleteTag).mockRejectedValue(new Error('Delete failed'))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const initialTags = [{ id: 'tag-1', name: 'Health', color: '#00ff00' }]
    const initialHabits = [makeHabit()]
    queryClient.setQueryData(tagKeys.lists(), initialTags)
    queryClient.setQueryData(habitKeys.lists(), initialHabits)

    const { result } = renderHook(() => useDeleteTag(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(result.current.mutateAsync('tag-1')).rejects.toThrow('Delete failed')
    })

    expect(queryClient.getQueryData(tagKeys.lists())).toEqual(initialTags)
    expect(queryClient.getQueryData(habitKeys.lists())).toEqual(initialHabits)
  })

  it('optimistically assigns tags onto the habit cache', async () => {
    const { assignTags } = await import('@/app/actions/tags')
    vi.mocked(assignTags).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(tagKeys.lists(), [
      { id: 'tag-1', name: 'Health', color: '#00ff00' },
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
    queryClient.setQueryData(habitKeys.lists(), [makeHabit()])

    const { result } = renderHook(() => useAssignTags(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      result.current.mutate({ habitId: 'habit-1', tagIds: ['tag-2'] })
      await Promise.resolve()
    })

    expect((queryClient.getQueryData(habitKeys.lists()) as HabitScheduleItem[])[0]?.tags).toEqual([
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
  })
})
