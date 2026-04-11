import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTourMockData } from '@/hooks/use-tour-mock-data'
import { habitKeys, goalKeys, tagKeys, gamificationKeys } from '@orbit/shared/query'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock shared/tour
vi.mock('@orbit/shared/tour', () => ({
  createTourMockHabits: vi.fn(() => [
    { id: 'mock-h-1', title: 'Mock Habit' },
  ]),
  createTourMockGoals: vi.fn(() => [
    { id: 'mock-g-1', title: 'Mock Goal' },
  ]),
  createTourMockTags: vi.fn(() => [
    { id: 'mock-t-1', name: 'Mock Tag' },
  ]),
}))

// Mock shared/utils
vi.mock('@orbit/shared/utils', () => ({
  formatAPIDate: vi.fn(() => '2025-01-01'),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return {
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    },
    queryClient,
  }
}

describe('useTourMockData', () => {
  it('injects mock data into query cache', () => {
    const { wrapper, queryClient } = createWrapper()
    const { result } = renderHook(() => useTourMockData(), { wrapper })

    act(() => {
      result.current.inject()
    })

    // Check that mock data was injected
    const todayFilters = { dateFrom: '2025-01-01', dateTo: '2025-01-01', includeOverdue: true }
    const habitsData = queryClient.getQueryData(
      habitKeys.list(todayFilters as Record<string, unknown>),
    )
    expect(habitsData).toBeDefined()

    const goalsData = queryClient.getQueryData(goalKeys.list({}))
    expect(goalsData).toBeDefined()

    const tagsData = queryClient.getQueryData(tagKeys.lists())
    expect(tagsData).toBeDefined()
  })

  it('restores query defaults and invalidates on restore', () => {
    const { wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useTourMockData(), { wrapper })

    act(() => {
      result.current.inject()
    })

    act(() => {
      result.current.restore()
    })

    // Should have invalidated habit, goal, tag, and gamification queries
    expect(invalidateSpy).toHaveBeenCalled()
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        habitKeys.all,
        goalKeys.all,
        tagKeys.all,
        gamificationKeys.all,
      ]),
    )
  })

  it('injects mock streak data when no existing streak', () => {
    const { wrapper, queryClient } = createWrapper()
    const { result } = renderHook(() => useTourMockData(), { wrapper })

    act(() => {
      result.current.inject()
    })

    const streakData = queryClient.getQueryData(gamificationKeys.streak())
    expect(streakData).toBeDefined()
    expect((streakData as { currentStreak: number }).currentStreak).toBe(1)
  })
})
