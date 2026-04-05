import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProfile, useHasProAccess, useTrialDaysLeft, useCurrentPlan, useTrialExpired, useTrialUrgent, useIsYearlyPro } from '@/hooks/use-profile'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock profile action
vi.mock('@/app/actions/profile', () => ({
  updateTimezone: vi.fn().mockResolvedValue(undefined),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
  }
}

function mockProfileResponse(profile: Profile) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(profile),
  })
}

describe('useProfile', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches and returns profile data', async () => {
    const profile = createMockProfile({ name: 'Thomas' })
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.profile).toBeDefined()
    expect(result.current.profile!.name).toBe('Thomas')
    expect(result.current.profile!.email).toBe('thomas@example.com')
  })

  it('returns undefined profile while loading', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // Never resolves

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    expect(result.current.profile).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('exposes invalidate helper', async () => {
    const profile = createMockProfile()
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(typeof result.current.invalidate).toBe('function')
  })

  it('exposes patchProfile helper', async () => {
    const profile = createMockProfile()
    mockProfileResponse(profile)

    const { result } = renderHook(() => useProfile(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(typeof result.current.patchProfile).toBe('function')
  })
})

describe('useHasProAccess', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns false for free user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: false }))

    const { result } = renderHook(() => useHasProAccess(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true for pro user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: true, plan: 'pro' }))

    const { result } = renderHook(() => useHasProAccess(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })
})

describe('useTrialDaysLeft', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns null when not in trial', async () => {
    mockProfileResponse(createMockProfile({ trialEndsAt: null }))

    const { result } = renderHook(() => useTrialDaysLeft(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBeNull())
  })

  it('returns positive days when trial is active', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5)
    mockProfileResponse(
      createMockProfile({ trialEndsAt: futureDate.toISOString(), isTrialActive: true }),
    )

    const { result } = renderHook(() => useTrialDaysLeft(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current).not.toBeNull()
      expect(result.current).toBeGreaterThanOrEqual(4)
      expect(result.current).toBeLessThanOrEqual(5)
    })
  })

  it('returns 0 when trial has expired', async () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)
    mockProfileResponse(
      createMockProfile({ trialEndsAt: pastDate.toISOString(), isTrialActive: false }),
    )

    const { result } = renderHook(() => useTrialDaysLeft(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(0))
  })
})

describe('useCurrentPlan', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns Free for free user', async () => {
    mockProfileResponse(createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe('Free'))
  })

  it('returns Trial for trial user', async () => {
    mockProfileResponse(createMockProfile({ isTrialActive: true }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe('Trial'))
  })

  it('returns Pro for pro user', async () => {
    mockProfileResponse(createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false }))

    const { result } = renderHook(() => useCurrentPlan(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe('Pro'))
  })
})

describe('useTrialExpired', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns false when no trial', async () => {
    mockProfileResponse(createMockProfile({ trialEndsAt: null }))

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true when trial ended and user is on free plan', async () => {
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: '2025-01-01T00:00:00Z',
        isTrialActive: false,
        plan: 'free',
      }),
    )

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when trial is still active', async () => {
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: '2099-01-01T00:00:00Z',
        isTrialActive: true,
        plan: 'free',
      }),
    )

    const { result } = renderHook(() => useTrialExpired(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('useTrialUrgent', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns true when trial ends within 2 days', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 1)
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: soon.toISOString(),
        isTrialActive: true,
      }),
    )

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when trial has more than 2 days left', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    mockProfileResponse(
      createMockProfile({
        trialEndsAt: future.toISOString(),
        isTrialActive: true,
      }),
    )

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false when not in trial', async () => {
    mockProfileResponse(createMockProfile({ trialEndsAt: null }))

    const { result } = renderHook(() => useTrialUrgent(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('useIsYearlyPro', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns true for yearly subscription', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        subscriptionInterval: 'yearly',
        isLifetimePro: false,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns true for lifetime pro', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        isLifetimePro: true,
        subscriptionInterval: null,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false for monthly pro', async () => {
    mockProfileResponse(
      createMockProfile({
        hasProAccess: true,
        plan: 'pro',
        subscriptionInterval: 'monthly',
        isLifetimePro: false,
      }),
    )

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false for free user', async () => {
    mockProfileResponse(createMockProfile({ hasProAccess: false, plan: 'free' }))

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns false when profile is not loaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // Never resolves

    const { result } = renderHook(() => useIsYearlyPro(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(false)
  })
})
