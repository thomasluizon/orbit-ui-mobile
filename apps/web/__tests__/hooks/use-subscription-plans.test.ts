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

const mockFetch = vi.fn()
const { mockReportApiError } = vi.hoisted(() => ({
  mockReportApiError: vi.fn(),
}))
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/api-fetch', () => ({
  fetchJson: vi.fn((url: string) =>
    fetch(url).then((res: Response) => {
      if (!res.ok) throw new Error('Fetch failed')
      return res.json()
    }),
  ),
  reportApiError: mockReportApiError,
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
    expect(monthlyEquivalent(7999)).toBe(667)
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
    mockReportApiError.mockReset()
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', mockFetch)
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

  it('leaves a caller owned plans failure to that observer', async () => {
    const queryClient = createQueryClient()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({
        error: 'Payment service temporarily unavailable',
        code: 'PAYMENT_SERVICE_UNAVAILABLE',
      }),
    })

    const { result } = renderHook(
      () => useSubscriptionPlans({ handlesError: true }),
      { wrapper: createWrapperWithClient(queryClient) },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryCache().find({ queryKey: subscriptionKeys.plans() }))
      .toBeDefined()
    expect(mockReportApiError).not.toHaveBeenCalled()
  })

  it('reports a shared pending failure for a later upgrade observer', async () => {
    const queryClient = createQueryClient()
    let resolveModalRequest: ((response: unknown) => void) | undefined

    mockFetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveModalRequest = resolve
    }))

    const modal = renderHook(
      () => useSubscriptionPlans({ handlesError: true }),
      { wrapper: createWrapperWithClient(queryClient) },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const upgrade = renderHook(
      () => useSubscriptionPlans(),
      { wrapper: createWrapperWithClient(queryClient) },
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)

    resolveModalRequest?.({
      ok: false,
      json: () => Promise.resolve({ error: 'Payment service unavailable' }),
    })
    await waitFor(() => expect(modal.result.current.isError).toBe(true))
    await waitFor(() => expect(upgrade.result.current.isError).toBe(true))
    expect(mockReportApiError).toHaveBeenCalledTimes(1)
    expect(mockReportApiError).toHaveBeenCalledWith(upgrade.result.current.error)
  })

  it('does not replay a settled modal failure while upgrade refetches', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(subscriptionKeys.plans(), makePlans({ currency: 'brl' }))
    const upgradePlans = makePlans({ currency: 'usd' })

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Payment service unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(upgradePlans),
      })

    const modal = renderHook(
      () => useSubscriptionPlans({ handlesError: true }),
      { wrapper: createWrapperWithClient(queryClient) },
    )

    await waitFor(() => expect(modal.result.current.isRefetchError).toBe(true))

    const upgrade = renderHook(
      () => useSubscriptionPlans(),
      { wrapper: createWrapperWithClient(queryClient) },
    )

    await waitFor(() => expect(upgrade.result.current.isSuccess).toBe(true))
    expect(upgrade.result.current.plans).toEqual(upgradePlans)
    expect(mockReportApiError).not.toHaveBeenCalled()
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

  it('includes the browser timezone in the plans request url', async () => {
    vi.stubGlobal('Intl', {
      DateTimeFormat: () => ({
        resolvedOptions: () => ({ timeZone: 'America/Sao_Paulo' }),
      }),
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makePlans()),
    })

    renderHook(() => useSubscriptionPlans(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('timeZone=America%2FSao_Paulo')
  })
})
