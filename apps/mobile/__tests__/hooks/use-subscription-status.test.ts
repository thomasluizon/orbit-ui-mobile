import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as SubscriptionStatus | undefined,
    queryFn: null as (() => Promise<SubscriptionStatus>) | null,
  }
  return {
    state,
    apiClient: vi.fn(),
    useQuery: vi.fn((options: { queryFn: () => Promise<SubscriptionStatus> }) => {
      state.queryFn = options.queryFn
      return { data: state.data, isLoading: false, isError: false }
    }),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

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
  source: 'play',
  lapseReason: null,
  subscriptionEndedAtUtc: null,
}

describe('mobile useSubscriptionStatus', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.state.queryFn = null
    mocks.apiClient.mockReset()
    mocks.useQuery.mockClear()
  })

  it('returns cached status and keeps an empty cache explicit', () => {
    expect(useSubscriptionStatus().status).toBeNull()
    mocks.state.data = status
    expect(useSubscriptionStatus().status).toEqual(status)
  })

  it('loads status from the subscription endpoint', async () => {
    mocks.apiClient.mockResolvedValue(status)
    useSubscriptionStatus()

    await expect(mocks.state.queryFn?.()).resolves.toEqual(status)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.subscription.status)
  })
})
