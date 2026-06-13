import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

import { useChatReward } from '@/hooks/use-chat-reward'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: undefined as Profile | undefined,
  }

  const queryClient = {
    setQueryData: vi.fn(
      (
        _queryKey: readonly unknown[],
        updater:
          | Profile
          | undefined
          | ((current: Profile | undefined) => Profile | undefined),
      ) => {
        state.profile =
          typeof updater === 'function'
            ? updater(state.profile) ?? state.profile
            : updater ?? state.profile
      },
    ),
  }

  return {
    state,
    queryClient,
    apiClient: vi.fn(),
    showRewardedAd: vi.fn(),
    markRewardClaimed: vi.fn(),
    useQueryClient: vi.fn(() => queryClient),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/hooks/use-ad-mob', () => ({
  useAdMob: () => ({
    isInitialized: true,
    canClaimReward: true,
    rewardsClaimedToday: 0,
    dailyRewardCap: 3,
    shouldShowAds: () => true,
    showRewardedAd: mocks.showRewardedAd,
    markRewardClaimed: mocks.markRewardClaimed,
  }),
}))

type RewardApi = ReturnType<typeof useChatReward>

function renderReward(): { current: RewardApi } {
  const ref: { current: RewardApi } = { current: null as unknown as RewardApi }
  function Probe() {
    ref.current = useChatReward()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  return ref
}

beforeEach(() => {
  mocks.state.profile = createMockProfile({ aiMessagesUsed: 5, aiMessagesLimit: 5 })
  mocks.apiClient.mockReset()
  mocks.showRewardedAd.mockReset()
  mocks.markRewardClaimed.mockReset()
  mocks.queryClient.setQueryData.mockClear()
})

describe('useChatReward', () => {
  it('patches the cached profile limit with the backend newLimit after a rewarded ad', async () => {
    mocks.showRewardedAd.mockResolvedValue(true)
    mocks.apiClient.mockResolvedValue({ bonusMessagesGranted: 5, newLimit: 10 })

    const reward = renderReward()
    await TestRenderer.act(async () => {
      await reward.current.watchAdForMessages()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(API.subscription.adReward, {
      method: 'POST',
    })
    expect(mocks.markRewardClaimed).toHaveBeenCalledOnce()
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      profileKeys.detail(),
      expect.any(Function),
    )
    expect(mocks.state.profile?.aiMessagesLimit).toBe(10)
    expect(mocks.state.profile?.aiMessagesUsed).toBe(5)
  })

  it('does not claim a reward or patch the cache when the ad is not earned', async () => {
    mocks.showRewardedAd.mockResolvedValue(false)

    const reward = renderReward()
    await TestRenderer.act(async () => {
      await reward.current.watchAdForMessages()
    })

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.markRewardClaimed).not.toHaveBeenCalled()
    expect(mocks.state.profile?.aiMessagesLimit).toBe(5)
  })

  it('leaves the cached limit untouched when the reward claim request fails', async () => {
    mocks.showRewardedAd.mockResolvedValue(true)
    mocks.apiClient.mockRejectedValue(new Error('network'))

    const reward = renderReward()
    await TestRenderer.act(async () => {
      await reward.current.watchAdForMessages()
    })

    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled()
    expect(mocks.state.profile?.aiMessagesLimit).toBe(5)
  })
})
