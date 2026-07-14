import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGoalProgressHistory } from '@/hooks/use-goal-progress-history'
import { useHabitTrends } from '@/hooks/use-habit-trends'
import { useStreakHistory } from '@/hooks/use-streak-history'
import { useXpHistory } from '@/hooks/use-xp-history'

const mockFetchJson = vi.fn()
vi.mock('@/lib/api-fetch', () => ({
  fetchJson: (url: string) => mockFetchJson(url),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const range = { from: '2026-01-01', to: '2026-01-31' }

describe('history query hooks', () => {
  beforeEach(() => {
    mockFetchJson.mockReset()
    mockFetchJson.mockResolvedValue({ points: [] })
  })

  it('requests a goal progress-history series scoped to the goal and range', async () => {
    const { result } = renderHook(() => useGoalProgressHistory('goal-1', range), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = mockFetchJson.mock.calls[0]![0] as string
    expect(url).toContain('dateFrom=2026-01-01')
    expect(url).toContain('dateTo=2026-01-31')
  })

  it('does not fetch goal progress history without a goalId', () => {
    const { result } = renderHook(() => useGoalProgressHistory('', range), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockFetchJson).not.toHaveBeenCalled()
  })

  it('requests habit completion trends for the range', async () => {
    const { result } = renderHook(() => useHabitTrends(range), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetchJson.mock.calls[0]![0] as string).toContain('dateFrom=2026-01-01')
  })

  it('requests the streak-history series for the range', async () => {
    const { result } = renderHook(() => useStreakHistory(range), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetchJson.mock.calls[0]![0] as string).toContain('dateTo=2026-01-31')
  })

  it('requests the xp-history series for the range', async () => {
    const { result } = renderHook(() => useXpHistory(range), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetchJson.mock.calls[0]![0] as string).toContain('dateFrom=2026-01-01')
  })

  it('surfaces a fetch failure through the query', async () => {
    mockFetchJson.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useXpHistory(range), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
