import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGoals, useGoalDetail, useGoalMetrics } from '@/hooks/use-goal-queries'
import { resetAuthStore } from '@/__tests__/support/account-change'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal, GoalDetailWithMetrics, GoalMetrics, PaginatedGoalResponse } from '@orbit/shared/types/goal'
import './session-query-setup'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(async () => {
  await resetAuthStore()
  mockFetch.mockReset()
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makePaginatedGoalResponse(items: Goal[]): PaginatedGoalResponse {
  return {
    items,
    page: 1,
    pageSize: 100,
    totalCount: items.length,
    totalPages: 1,
  }
}

describe('useGoals', () => {
  it('fetches and normalizes goals', async () => {
    const goals = [
      createMockGoal({ id: 'g-1', title: 'Read Books', position: 1 }),
      createMockGoal({ id: 'g-2', title: 'Exercise', position: 0 }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse(goals)),
    })

    const { result } = renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.allGoals).toEqual([goals[1], goals[0]])
    expect(result.current.data?.goalsById).toEqual(new Map(goals.map((goal) => [goal.id, goal])))
    expect(result.current.data?.totalCount).toBe(2)
  })

  it('passes status filter to API', async () => {
    const goals = [createMockGoal({ id: 'g-1', status: 'Active' })]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse(goals)),
    })

    const { result } = renderHook(() => useGoals('Active'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('status=Active')
  })

  it('fetches without status when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse([])),
    })

    const { result } = renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('status=')
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isError).toBe(false)
    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toMatchObject({ status: 500, message: 'Server error' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 500, message: 'Server error' })
    expect(result.current.data).toBeUndefined()
  })

  it('handles empty goal list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse([])),
    })

    const { result } = renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ allGoals: [], goalsById: new Map(), totalCount: 0 })
  })
})

describe('useGoalDetail', () => {
  it('fetches goal detail when id is provided', async () => {
    const detail: GoalDetailWithMetrics = {
      goal: {
        id: 'g-1',
        title: 'Read Books',
        description: 'Read 12 books this year',
        targetValue: 12,
        currentValue: 3,
        unit: 'books',
        status: 'Active',
        deadline: null,
        position: 0,
        createdAtUtc: '2025-01-01T00:00:00Z',
        completedAtUtc: null,
        progressPercentage: 25,
        progressHistory: [],
        linkedHabits: [],
      },
      metrics: {
        progressPercentage: 25,
        velocityPerDay: 0,
        projectedCompletionDate: null,
        daysToDeadline: null,
        trackingStatus: 'OnTrack',
        habitAdherence: [],
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    })

    const { result } = renderHook(() => useGoalDetail('g-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.goal.title).toBe('Read Books')
  })

  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useGoalDetail(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})

describe('useGoalMetrics', () => {
  it('fetches goal metrics when id is provided', async () => {
    const metrics: GoalMetrics = {
      progressPercentage: 25,
      velocityPerDay: 0.4,
      projectedCompletionDate: '2025-12-31',
      daysToDeadline: 120,
      trackingStatus: 'OnTrack',
      habitAdherence: [],
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metrics),
    })

    const { result } = renderHook(() => useGoalMetrics('g-1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.trackingStatus).toBe('OnTrack')
  })

  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useGoalMetrics(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
