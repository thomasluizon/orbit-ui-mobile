import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { subscriptionKeys } from '@orbit/shared/query'
import {
  useSubscriptionPlans,
  formatPrice,
  monthlyEquivalent,
} from '@/hooks/use-subscription-plans'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock fetchJson
vi.mock('@/lib/api-fetch', () => ({
  fetchJson: vi.fn((url: string) =>
    fetch(url).then((res: Response) => {
      if (!res.ok) throw new Error('Fetch failed')
      return res.json()
    }),
  ),
}))

function createWrapper() {
  return createWrapperWithClient(createQueryClient())
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapperWithClient(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makePlans(overrides: Partial<SubscriptionPlans> = {}): SubscriptionPlans {
  return {
    monthly: { unitAmount: 999, currency: 'usd' },
    yearly: { unitAmount: 7999, currency: 'usd' },
    savingsPercent: 33,
    couponPercentOff: null,
    currency: 'usd',
    ...overrides,
  }
}

describe('formatPrice', () => {
  it('formats USD price with en-US locale', () => {
    const result = formatPrice(999, 'usd')
    expect(result).toBe('$9.99')
  })

  it('formats BRL price with pt-BR locale', () => {
    const result = formatPrice(4990, 'brl')
    // pt-BR locale uses R$ prefix
    expect(result).toContain('49,90')
  })

  it('handles zero amount', () => {
    const result = formatPrice(0, 'usd')
    expect(result).toBe('$0.00')
  })

  it('handles large amounts', () => {
    const result = formatPrice(99999, 'usd')
    expect(result).toBe('$999.99')
  })
})

describe('monthlyEquivalent', () => {
  it('divides yearly amount by 12 and rounds', () => {
    expect(monthlyEquivalent(7999)).toBe(667) // 7999 / 12 = 666.58 -> 667
  })

  it('handles exact division', () => {
    expect(monthlyEquivalent(12000)).toBe(1000)
  })

  it('handles zero', () => {
    expect(monthlyEquivalent(0)).toBe(0)
  })
})

describe('useSubscriptionPlans', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches subscription plans', async () => {
    const plans = makePlans()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(plans),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.plans).toBeDefined()
    expect(result.current.plans!.monthly.unitAmount).toBe(999)
    expect(result.current.plans!.yearly.unitAmount).toBe(7999)
  })

  it('returns null plans when query fails', () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Fail' }),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    expect(result.current.plans).toBeNull()
  })

  it('exposes formatPrice and monthlyEquivalent utilities', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePlans()),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    expect(typeof result.current.formatPrice).toBe('function')
    expect(typeof result.current.monthlyEquivalent).toBe('function')
  })

  it('computes discounted amount without coupon', async () => {
    const plans = makePlans({ couponPercentOff: null })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(plans),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // No coupon - should return original amount
    expect(result.current.discountedAmount(1000)).toBe(1000)
  })

  it('computes discounted amount with coupon', async () => {
    const plans = makePlans({ couponPercentOff: 20 })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(plans),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // 20% off 1000 = 800
    expect(result.current.discountedAmount(1000)).toBe(800)
  })

  it('refetches plans on mount even when cached data is still fresh', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(subscriptionKeys.plans(), makePlans())

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePlans({
        monthly: { unitAmount: 1990, currency: 'brl' },
        yearly: { unitAmount: 19900, currency: 'brl' },
        currency: 'brl',
      })),
    })

    const { result } = renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapperWithClient(queryClient),
    })

    await waitFor(() => expect(result.current.plans?.currency).toBe('brl'))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
