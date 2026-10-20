import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { API } from '@orbit/shared/api'
import { createMockGoal, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { useGoals } from '@/hooks/use-goal-queries'
import { useHabits } from '@/hooks/use-habit-queries'
import { useAuthStore } from '@/stores/auth-store'
import { buildSessionRefreshHeaders } from '@/lib/session-refresh'

const mockFetch = vi.fn()
let queryClient: QueryClient

function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  useAuthStore.setState(useAuthStore.getInitialState())
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  useAuthStore.setState(useAuthStore.getInitialState())
  vi.unstubAllGlobals()
})

const resources = [
  { name: 'goals', endpoint: API.goals.list, useHook: () => useGoals(), makeItem: () => createMockGoal({ id: 'item-1' }) },
  { name: 'habits', endpoint: API.habits.list, useHook: () => useHabits({}), makeItem: () => createMockHabitScheduleItem({ id: 'item-1' }) },
]

describe.each(resources)('$name query session composition', ({ endpoint, useHook, makeItem }) => {
  it.each([true, false])('accepts a recovered response with populated=%s after a slow session check', async (populated) => {
    const items = populated ? [makeItem()] : []
    const expiresAt = Date.now() + 60_000
    useAuthStore.setState({ sessionRefreshFailed: true })
    mockFetch.mockImplementation(async (input: string) => {
      if (input.split('?')[0] === endpoint) {
        return Response.json({ items, page: 1, pageSize: 100, totalCount: items.length, totalPages: 1 })
      }
      if (input === '/api/auth/session') {
        await new Promise((resolve) => setTimeout(resolve, 1_200))
        return Response.json({ expiresAt, userId: null, refreshFailed: false })
      }
      throw new Error('Unexpected request during session recovery')
    })
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper })

    expect(result.current.isFetching).toBe(true)
    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalCount).toBe(items.length)
    const normalized = result.current.data
    const itemIds = normalized && ('goalsById' in normalized
      ? Array.from(normalized.goalsById.keys())
      : Array.from(normalized.habitsById.keys()))
    expect(itemIds).toEqual(populated ? ['item-1'] : [])
    expect(result.current.error).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, sessionRefreshFailed: false, expiresAt })
  })

  it('exposes the rejected response after confirming session refresh failure', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      if (input.split('?')[0] === endpoint) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: buildSessionRefreshHeaders(true) })
      }
      if (input === '/api/auth/session') {
        await new Promise((resolve) => setTimeout(resolve, 1_200))
        return Response.json({ expiresAt: null, userId: null, refreshFailed: true }, { status: 401 })
      }
      throw new Error('Unexpected request during session failure confirmation')
    })
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper })

    expect(result.current.isError).toBe(false)
    await act(async () => {
      await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toMatchObject({ status: 401, message: 'Unauthorized' })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 401, message: 'Unauthorized' })
    expect(result.current.data).toBeUndefined()
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionRefreshFailed: true })
  })
})
