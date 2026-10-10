import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCalendarData } from '@/hooks/use-calendar-data'

const { recoverSessionRefreshFailure } = vi.hoisted(() => ({
  recoverSessionRefreshFailure: vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ recoverSessionRefreshFailure }),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('calendar session readiness', () => {
  beforeEach(() => {
    recoverSessionRefreshFailure.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([200, 500])('settles a %s response only after session recovery settles', async (status) => {
    let settleRecovery!: () => void
    recoverSessionRefreshFailure.mockReturnValueOnce(new Promise<void>((resolve) => {
      settleRecovery = resolve
    }))
    const response = Response.json(
      status === 200 ? { habits: [], logs: {} } : { error: 'Internal server error' },
      { status },
    )
    const readBody = vi.spyOn(response, 'json')
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useCalendarData(new Date(2025, 0, 1)), {
      wrapper: createWrapper(),
    })

    try {
      await waitFor(() => expect(recoverSessionRefreshFailure).toHaveBeenCalledOnce())
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/api/habits/calendar-month?dateFrom=2025-01-01&dateTo=2025-01-31',
        undefined,
      )
      expect(readBody).not.toHaveBeenCalled()
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isFetching).toBe(true)
      expect(result.current.dayMap.size).toBe(0)
      expect(result.current.error).toBeNull()

      await act(async () => { settleRecovery() })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.isFetching).toBe(false)
      expect(readBody).toHaveBeenCalledOnce()
      expect(result.current.error).toBe(status === 200 ? null : 'Internal server error')
    } finally {
      await act(async () => { settleRecovery() })
    }
  })
})
