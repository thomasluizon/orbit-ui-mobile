import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useGoals,
  useGoalDetail,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
} from '@/hooks/use-goals'
import type { Goal, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import { createMockGoal } from '@orbit/shared/__tests__/factories'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock server actions
vi.mock('@/app/actions/goals', () => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  updateGoalProgress: vi.fn(),
  updateGoalStatus: vi.fn(),
  reorderGoals: vi.fn(),
  linkHabitsToGoal: vi.fn(),
}))

// Mock UI store
vi.mock('@/stores/ui-store', () => ({
  useUIStore: Object.assign(
    () => ({
      setGoalCompletedCelebration: vi.fn(),
    }),
    {
      getState: () => ({
        setGoalCompletedCelebration: vi.fn(),
      }),
    },
  ),
}))

function makePaginatedGoalResponse(items: Goal[]): PaginatedGoalResponse {
  return {
    items,
    page: 1,
    pageSize: 100,
    totalCount: items.length,
    totalPages: 1,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

describe('useGoals', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and normalizes goals sorted by position', async () => {
    const goals = [
      createMockGoal({ id: 'g-1', title: 'Goal A', position: 2 }),
      createMockGoal({ id: 'g-2', title: 'Goal B', position: 0 }),
      createMockGoal({ id: 'g-3', title: 'Goal C', position: 1 }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse(goals)),
    })

    const { result } = renderHook(() => useGoals(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.allGoals).toHaveLength(3)
    // Should be sorted by position
    expect(result.current.data!.allGoals[0]!.id).toBe('g-2')
    expect(result.current.data!.allGoals[1]!.id).toBe('g-3')
    expect(result.current.data!.allGoals[2]!.id).toBe('g-1')
  })

  it('populates goalsById map', async () => {
    const goals = [
      createMockGoal({ id: 'g-1' }),
      createMockGoal({ id: 'g-2', title: 'Lose Weight' }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse(goals)),
    })

    const { result } = renderHook(() => useGoals(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.goalsById.size).toBe(2)
    expect(result.current.data!.goalsById.get('g-1')?.title).toBe('Read 12 Books')
    expect(result.current.data!.goalsById.get('g-2')?.title).toBe('Lose Weight')
  })

  it('passes status filter to API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makePaginatedGoalResponse([
            createMockGoal({ id: 'g-1', status: 'Completed' }),
          ]),
        ),
    })

    const { result } = renderHook(() => useGoals('Completed'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Check the URL includes status param
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('status=Completed')
  })

  it('returns empty data for no goals', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse([])),
    })

    const { result } = renderHook(() => useGoals(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data!.goalsById.size).toBe(0)
    expect(result.current.data!.allGoals).toEqual([])
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal Server Error' }),
    })

    const { result } = renderHook(() => useGoals(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useCreateGoal', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls createGoal action', async () => {
    const { createGoal } = await import('@/app/actions/goals')
    const mockedCreateGoal = vi.mocked(createGoal)
    mockedCreateGoal.mockResolvedValue({ id: 'new-goal' } as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useCreateGoal(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        title: 'New Goal',
        targetValue: 10,
        unit: 'items',
      })
    })

    expect(mockedCreateGoal).toHaveBeenCalledWith({
      title: 'New Goal',
      targetValue: 10,
      unit: 'items',
    })
  })
})

describe('useUpdateGoal', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls updateGoal action with goalId and data', async () => {
    const { updateGoal } = await import('@/app/actions/goals')
    const mockedUpdateGoal = vi.mocked(updateGoal)
    mockedUpdateGoal.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useUpdateGoal(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        goalId: 'g-1',
        data: { title: 'Updated', targetValue: 20, unit: 'books' },
      })
    })

    expect(mockedUpdateGoal).toHaveBeenCalledWith('g-1', {
      title: 'Updated',
      targetValue: 20,
      unit: 'books',
    })
  })
})

describe('useDeleteGoal', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls deleteGoal action', async () => {
    const { deleteGoal } = await import('@/app/actions/goals')
    const mockedDeleteGoal = vi.mocked(deleteGoal)
    mockedDeleteGoal.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useDeleteGoal(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('g-1')
    })

    expect(mockedDeleteGoal).toHaveBeenCalledWith('g-1')
  })
})

describe('useUpdateGoalProgress', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls updateGoalProgress action', async () => {
    const { updateGoalProgress } = await import('@/app/actions/goals')
    const mockedUpdateProgress = vi.mocked(updateGoalProgress)
    mockedUpdateProgress.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useUpdateGoalProgress(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        goalId: 'g-1',
        data: { currentValue: 5, note: 'Halfway' },
      })
    })

    expect(mockedUpdateProgress).toHaveBeenCalledWith('g-1', {
      currentValue: 5,
      note: 'Halfway',
    })
  })
})

describe('useUpdateGoalStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls updateGoalStatus action', async () => {
    const { updateGoalStatus } = await import('@/app/actions/goals')
    const mockedUpdateStatus = vi.mocked(updateGoalStatus)
    mockedUpdateStatus.mockResolvedValue(undefined as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useUpdateGoalStatus(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        goalId: 'g-1',
        data: { status: 'Completed' },
        goalName: 'Ship Orbit',
      })
    })

    expect(mockedUpdateStatus).toHaveBeenCalledWith('g-1', { status: 'Completed' })
  })
})
