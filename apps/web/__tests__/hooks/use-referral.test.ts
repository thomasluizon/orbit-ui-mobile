import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useReferral } from '@/hooks/use-referral'
import type { ReferralDashboard } from '@orbit/shared/types/referral'

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

function makeDashboard(overrides: Partial<ReferralDashboard> = {}): ReferralDashboard {
  return {
    code: 'ABC123',
    link: 'https://app.useorbit.org/r/ABC123',
    stats: {
      referralCode: 'ABC123',
      referralLink: 'https://app.useorbit.org/r/ABC123',
      successfulReferrals: 3,
      pendingReferrals: 1,
      maxReferrals: 10,
      rewardType: 'discount',
      discountPercent: 20,
    },
    ...overrides,
  }
}

describe('useReferral', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches referral dashboard data', async () => {
    const dashboard = makeDashboard()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dashboard),
    })

    const { result } = renderHook(() => useReferral(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.code).toBe('ABC123')
    expect(result.current.stats!.successfulReferrals).toBe(3)
  })

  it('computes referral URL from code', async () => {
    const dashboard = makeDashboard({ code: 'XYZ789' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(dashboard),
    })

    const { result } = renderHook(() => useReferral(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.referralUrl).toBe('https://app.useorbit.org/r/XYZ789')
  })

  it('returns empty referralUrl when no code', () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Fail' }),
    })

    const { result } = renderHook(() => useReferral(), {
      wrapper: createWrapper(),
    })

    expect(result.current.referralUrl).toBe('')
    expect(result.current.code).toBeNull()
    expect(result.current.stats).toBeNull()
  })
})
