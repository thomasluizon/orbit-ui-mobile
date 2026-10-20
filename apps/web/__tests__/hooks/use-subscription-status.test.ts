import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'

const mockFetch = vi.fn()

const status: SubscriptionStatus = {
  plan: 'pro',
  hasProAccess: true,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: '2026-09-28T00:00:00Z',
  aiMessagesUsed: 8,
  aiMessagesLimit: 50,
  isLifetimePro: false,
  subscriptionInterval: 'yearly',
  source: 'stripe',
  lapseReason: null,
  subscriptionEndedAtUtc: null,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useSubscriptionStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the live subscription status from the status endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(status),
    })
    const { result } = renderHook(() => useSubscriptionStatus(), {
      wrapper: createWrapper(),
    })

    await act(async () => { await result.current.refetch({ cancelRefetch: false, throwOnError: true }) })
    await waitFor(() => expect(result.current.status).toEqual(status))
    expect(mockFetch).toHaveBeenCalledWith(API.subscription.status, { headers: expect.any(Headers) })
  })

  it('keeps status empty when the live request fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    const { result } = renderHook(() => useSubscriptionStatus(), {
      wrapper: createWrapper(),
    })

    await act(async () => { await expect(result.current.refetch({ cancelRefetch: false, throwOnError: true })).rejects.toThrow() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.status).toBeNull()
  })
})
