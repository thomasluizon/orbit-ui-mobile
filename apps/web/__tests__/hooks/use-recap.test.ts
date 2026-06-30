import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { useRecap } from '@/hooks/use-recap'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/api-fetch', () => ({
  fetchJson: vi.fn((url: string) =>
    fetch(url).then((res: Response) => {
      if (!res.ok) throw new Error('Fetch failed')
      return res.json()
    }),
  ),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useRecap', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('does not fetch while disabled (the default)', () => {
    const { result } = renderHook(() => useRecap('week'), { wrapper: createWrapper() })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('fetches the recap for the requested period when enabled', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockRecap({ period: 'month' })),
    })

    const { result } = renderHook(() => useRecap('month', true), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith('/api/gamification/recap?period=month')
    expect(result.current.data!.period).toBe('month')
  })
})
