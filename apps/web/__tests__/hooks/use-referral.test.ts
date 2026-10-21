import type { ZodType } from 'zod'
import { resetAccountQueries } from '@orbit/shared/query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useReferral } from '@/hooks/use-referral'
import type { ReferralDashboard } from '@orbit/shared/types/referral'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/api-fetch', () => ({
  fetchJson: vi.fn((url: string, schema?: ZodType) =>
    fetch(url).then((res: Response) => {
      if (!res.ok) throw new Error('Fetch failed')
      return res.json().then((payload: unknown) => schema ? schema.parse(payload) : payload)
    }),
  ),
}))

function createWrapper(queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })) {
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

  it('uses the public staging origin for referral links', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app-staging.useorbit.org')
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeDashboard({ code: 'XYZ789' })),
    })

    const { result } = renderHook(() => useReferral(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.referralUrl).toBe('https://app-staging.useorbit.org/r/XYZ789')
    vi.unstubAllEnvs()
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
  it.each([
    { rewardType: 'pro_days', proDaysPerReferral: 11, discountPercent: 23 },
    { rewardType: 'future_reward', proDaysPerReferral: 11, discountPercent: 23 },
    { rewardType: undefined, discountPercent: undefined },
    { rewardType: 'pro_days', proDaysPerReferral: 'bad', discountPercent: 23 },
  ])('validates dashboard facts while retaining optional reward compatibility %s', async (reward) => {
    const dashboard = makeDashboard()
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...dashboard, stats: { ...dashboard.stats, ...reward } }) })
    const { result, rerender } = renderHook(() => useReferral(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.code).toBe(dashboard.code)
    expect(result.current.stats?.rewardType).toBe(reward.rewardType)
    rerender()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retains a real dashboard failure when its required counts are malformed', async () => {
    const dashboard = makeDashboard()
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...dashboard, stats: { ...dashboard.stats, successfulReferrals: 'bad' } }) })
    const { result } = renderHook(() => useReferral(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.stats).toBeNull()
  })

  it('clears the previous account code and reward before the replacement request completes', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = makeDashboard()
    let finish!: (response: unknown) => void
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...first, stats: { ...first.stats, rewardType: 'pro_days', proDaysPerReferral: 11 } }) })
    mockFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { result } = renderHook(() => useReferral(), { wrapper: createWrapper(queryClient) })
    await waitFor(() => expect(result.current.code).toBe('ABC123'))
    await act(async () => { void resetAccountQueries(queryClient, 'signed-in'); await Promise.resolve() })
    await waitFor(() => expect(result.current.code).toBeNull())
    expect(result.current.referralUrl).toBe('')
    expect(result.current.stats).toBeNull()
    finish({ ok: true, json: () => Promise.resolve(makeDashboard({ code: 'NEXT' })) })
    await waitFor(() => expect(result.current.code).toBe('NEXT'))
    expect(result.current.stats?.rewardType).toBe('discount')
    expect(result.current.stats?.proDaysPerReferral).toBeUndefined()
    expect(result.current.referralUrl).toBe('https://app.useorbit.org/r/NEXT')
    queryClient.clear()
  })

})
