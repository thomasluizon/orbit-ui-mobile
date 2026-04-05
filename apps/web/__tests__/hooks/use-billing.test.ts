import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useBilling } from '@/hooks/use-billing'
import type { BillingDetails } from '@orbit/shared/types/subscription'

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

function makeBillingDetails(overrides: Partial<BillingDetails> = {}): BillingDetails {
  return {
    status: 'active',
    currentPeriodEnd: '2025-02-15T00:00:00Z',
    cancelAtPeriodEnd: false,
    interval: 'month',
    amountPerPeriod: 999,
    currency: 'usd',
    paymentMethod: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2026,
    },
    recentInvoices: [],
    ...overrides,
  }
}

describe('useBilling', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('does not fetch when not enabled', async () => {
    const { result } = renderHook(() => useBilling(false), {
      wrapper: createWrapper(),
    })

    // Should not have made any fetch calls
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.billing).toBeNull()
  })

  it('fetches billing details when enabled', async () => {
    const billing = makeBillingDetails()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(billing),
    })

    const { result } = renderHook(() => useBilling(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.billing).toBeDefined()
    expect(result.current.billing!.status).toBe('active')
    expect(result.current.billing!.interval).toBe('month')
  })

  it('returns null billing on 404 (lifetime Pro)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve(null),
    })

    const { result } = renderHook(() => useBilling(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.billing).toBeNull()
  })

  it('throws on non-404 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useBilling(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
