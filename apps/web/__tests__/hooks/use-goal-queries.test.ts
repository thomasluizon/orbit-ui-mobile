import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGoals, useGoalDetail, useGoalMetrics } from '@/hooks/use-goal-queries'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal, GoalDetailWithMetrics, GoalMetrics, PaginatedGoalResponse } from '@orbit/shared/types/goal'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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
  beforeEach(() => {
    mockFetch.mockReset()
  })

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

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeDefined()
  })

  it('passes status filter to API', async () => {
    const goals = [createMockGoal({ id: 'g-1', status: 'Active' })]
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse(goals)),
    })

    renderHook(() => useGoals('Active'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain('status=Active')
  })

  it('fetches without status when not provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse([])),
    })

    renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

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

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('handles empty goal list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePaginatedGoalResponse([])),
    })

    const { result } = renderHook(() => useGoals(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
  })
})

describe('useGoalDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches goal detail when id is provided', async () => {
    const detail: GoalDetailWithMetrics = {
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
      linkedHabits: [],
      metrics: {
        totalHabitsLinked: 0,
        totalHabitCompletions: 0,
        averageWeeklyCompletions: 0,
        averageMonthlyCompletions: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    })

    const { result } = renderHook(() => useGoalDetail('g-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.title).toBe('Read Books')
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
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches goal metrics when id is provided', async () => {
    const metrics: GoalMetrics = {
      totalHabitsLinked: 3,
      totalHabitCompletions: 45,
      averageWeeklyCompletions: 5,
      averageMonthlyCompletions: 20,
      currentStreak: 7,
      longestStreak: 14,
      lastActivityDate: '2025-01-15',
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(metrics),
    })

    const { result } = renderHook(() => useGoalMetrics('g-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalHabitsLinked).toBe(3)
  })

  it('does not fetch when id is null', () => {
    const { result } = renderHook(() => useGoalMetrics(null), {
      wrapper: createWrapper(),
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
