import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

vi.unmock('@/hooks/use-ad-mob')

type MockAd = {
  addAdEventListener: (event: string, listener: (payload?: unknown) => void) => () => void
  load: () => void
  show: () => Promise<void>
  emit: (event: string, payload?: unknown) => void
}

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Profile,
    interstitials: [] as MockAd[],
    rewardeds: [] as MockAd[],
  }
  const constants = {
    appOwnership: 'standalone',
    expoConfig: {
      extra: {},
    },
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

  const initialize = vi.fn(async () => undefined)
  const gatherConsent = vi.fn(async () => undefined)
  const getConsentInfo = vi.fn(async () => ({ canRequestAds: true }))

  const createMockAd = (): MockAd => {
    const listeners = new Map<string, Set<(payload?: unknown) => void>>()

    return {
      addAdEventListener: vi.fn((event: string, listener: (payload?: unknown) => void) => {
        const eventListeners = listeners.get(event) ?? new Set<(payload?: unknown) => void>()
        eventListeners.add(listener)
        listeners.set(event, eventListeners)

        return () => {
          eventListeners.delete(listener)
        }
      }),
      load: vi.fn(() => undefined),
      show: vi.fn(async () => undefined),
      emit: (event: string, payload?: unknown) => {
        listeners.get(event)?.forEach((listener) => listener(payload))
      },
    }
  }

  const createInterstitial = vi.fn(() => {
    const ad = createMockAd()
    state.interstitials.push(ad)
    return ad
  })

  const createRewarded = vi.fn(() => {
    const ad = createMockAd()
    state.rewardeds.push(ad)
    return ad
  })

  return {
    constants,
    state,
    queryClient,
    initialize,
    gatherConsent,
    getConsentInfo,
    createInterstitial,
    createRewarded,
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mocks.state.profile,
  }),
}))

vi.mock('expo-constants', () => ({
  default: mocks.constants,
}))

vi.mock('react-native-google-mobile-ads', () => ({
  default: () => ({
    initialize: mocks.initialize,
  }),
  AdEventType: {
    LOADED: 'loaded',
    ERROR: 'error',
    CLOSED: 'closed',
  },
  RewardedAdEventType: {
    EARNED_REWARD: 'rewarded',
  },
  TestIds: {
    INTERSTITIAL: 'test-interstitial',
    REWARDED: 'test-rewarded',
  },
  AdsConsent: {
    gatherConsent: mocks.gatherConsent,
    getConsentInfo: mocks.getConsentInfo,
  },
  InterstitialAd: {
    createForAdRequest: mocks.createInterstitial,
  },
  RewardedAd: {
    createForAdRequest: mocks.createRewarded,
  },
}))

async function renderUseAdMob() {
  const { useAdMob } = await import('@/hooks/use-ad-mob')
  let latestResult: ReturnType<typeof useAdMob> | null = null

  function Harness() {
    latestResult = useAdMob()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  return {
    get result() {
      if (!latestResult) {
        throw new Error('useAdMob hook did not render')
      }

      return latestResult
    },
  }
}

describe('mobile useAdMob', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@/hooks/use-ad-mob')
    mocks.state.profile = createMockProfile({
      hasProAccess: false,
      isTrialActive: false,
      adRewardsClaimedToday: 0,
    })
    mocks.constants.appOwnership = 'standalone'
    mocks.constants.expoConfig.extra = {}
    mocks.state.interstitials = []
    mocks.state.rewardeds = []
    mocks.initialize.mockClear()
    mocks.gatherConsent.mockClear()
    mocks.getConsentInfo.mockClear()
    mocks.getConsentInfo.mockResolvedValue({ canRequestAds: true })
    mocks.queryClient.setQueryData.mockClear()
    mocks.createInterstitial.mockClear()
    mocks.createRewarded.mockClear()
  })

  it('initializes the native SDK once', async () => {
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
      await result.initialize()
      await Promise.resolve()
    })

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.gatherConsent).toHaveBeenCalledTimes(1)
  })

  it('does not initialize when consent blocks ad requests', async () => {
    mocks.getConsentInfo.mockResolvedValue({ canRequestAds: false })
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
      await Promise.resolve()
    })

    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it('shows an interstitial on the first and fourth eligible completions', async () => {
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    const firstAttempt = result.showInterstitialIfDue()
    await Promise.resolve()
    const firstAd = mocks.state.interstitials[0]
    expect(mocks.createInterstitial).toHaveBeenCalledWith('test-interstitial')
    expect(firstAd?.load).toHaveBeenCalledTimes(1)
    firstAd?.emit('loaded')
    await Promise.resolve()
    expect(firstAd?.show).toHaveBeenCalledTimes(1)
    firstAd?.emit('closed')
    await firstAttempt

    await result.showInterstitialIfDue()
    await result.showInterstitialIfDue()
    expect(mocks.state.interstitials).toHaveLength(1)

    const fourthAttempt = result.showInterstitialIfDue()
    await Promise.resolve()
    const fourthAd = mocks.state.interstitials[1]
    expect(fourthAd?.load).toHaveBeenCalledTimes(1)
    fourthAd?.emit('loaded')
    await Promise.resolve()
    expect(fourthAd?.show).toHaveBeenCalledTimes(1)
    fourthAd?.emit('closed')
    await fourthAttempt
  })

  it('returns true after a rewarded ad grants a reward', async () => {
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    const rewardAttempt = result.showRewardedAd()
    await Promise.resolve()
    const rewardedAd = mocks.state.rewardeds[0]
    expect(mocks.createRewarded).toHaveBeenCalledWith('test-rewarded')
    expect(rewardedAd?.load).toHaveBeenCalledTimes(1)
    rewardedAd?.emit('loaded')
    await Promise.resolve()
    expect(rewardedAd?.show).toHaveBeenCalledTimes(1)
    rewardedAd?.emit('rewarded')
    rewardedAd?.emit('closed')

    await expect(rewardAttempt).resolves.toBe(true)
  })

  it('uses production ad unit ids when test mode is disabled', async () => {
    mocks.constants.expoConfig.extra = {
      adMob: {
        useTestIds: false,
        androidInterstitialId: 'prod-interstitial',
        androidRewardedId: 'prod-rewarded',
      },
    }
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    const interstitialAttempt = result.showInterstitialIfDue()
    await Promise.resolve()
    expect(mocks.createInterstitial).toHaveBeenCalledWith('prod-interstitial')
    mocks.state.interstitials[0]?.emit('loaded')
    await Promise.resolve()
    mocks.state.interstitials[0]?.emit('closed')
    await interstitialAttempt

    const rewardedAttempt = result.showRewardedAd()
    await Promise.resolve()
    expect(mocks.createRewarded).toHaveBeenCalledWith('prod-rewarded')
    mocks.state.rewardeds[0]?.emit('loaded')
    await Promise.resolve()
    mocks.state.rewardeds[0]?.emit('rewarded')
    mocks.state.rewardeds[0]?.emit('closed')
    await expect(rewardedAttempt).resolves.toBe(true)
  })

  it('increments the claimed reward count in the profile cache', async () => {
    mocks.state.profile = createMockProfile({ adRewardsClaimedToday: 1 })
    const { result } = await renderUseAdMob()

    result.markRewardClaimed()

    expect(mocks.queryClient.setQueryData).toHaveBeenCalledTimes(1)
    expect(mocks.state.profile.adRewardsClaimedToday).toBe(2)
  })

  it('disables ads for pro users', async () => {
    mocks.state.profile = createMockProfile({ hasProAccess: true })
    const { result } = await renderUseAdMob()

    expect(result.shouldShowAds()).toBe(false)
  })
})
