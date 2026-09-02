import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'
import { Platform } from 'react-native'

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
  }
  const constants = {
    expoGoConfig: null as Record<string, unknown> | null,
    expoConfig: {
      extra: {},
    },
  }

  const initialize = vi.fn(() => Promise.resolve())
  const gatherConsent = vi.fn(() => Promise.resolve())
  const getConsentInfo = vi.fn(() => Promise.resolve({ canRequestAds: true }))

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
      show: vi.fn(() => Promise.resolve()),
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

  return {
    constants,
    state,
    initialize,
    gatherConsent,
    getConsentInfo,
    createInterstitial,
  }
})

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
  TestIds: {
    INTERSTITIAL: 'test-interstitial',
  },
  AdsConsent: {
    gatherConsent: mocks.gatherConsent,
    getConsentInfo: mocks.getConsentInfo,
  },
  InterstitialAd: {
    createForAdRequest: mocks.createInterstitial,
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
    Platform.OS = 'android'
    mocks.constants.expoGoConfig = null
    mocks.constants.expoConfig.extra = {}
    mocks.state.interstitials = []
    mocks.initialize.mockClear()
    mocks.gatherConsent.mockClear()
    mocks.getConsentInfo.mockClear()
    mocks.getConsentInfo.mockResolvedValue({ canRequestAds: true })
    mocks.createInterstitial.mockClear()
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

  it('uses production ad unit ids when test mode is disabled', async () => {
    mocks.constants.expoConfig.extra = {
      adMob: {
        useTestIds: false,
        androidInterstitialId: 'prod-interstitial',
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

    expect(mocks.createInterstitial).not.toHaveBeenCalledWith('test-interstitial')
  })

  it('uses the configured iOS ad unit ids on iOS', async () => {
    Platform.OS = 'ios'
    mocks.constants.expoConfig.extra = {
      adMob: {
        useTestIds: false,
        iosInterstitialId: 'ios-interstitial',
      },
    }
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    const interstitialAttempt = result.showInterstitialIfDue()
    await Promise.resolve()
    expect(mocks.createInterstitial).toHaveBeenCalledWith('ios-interstitial')
    mocks.state.interstitials[0]?.emit('loaded')
    await Promise.resolve()
    mocks.state.interstitials[0]?.emit('closed')
    await interstitialAttempt

  })

  it('keeps every ad path unavailable in Expo Go', async () => {
    mocks.constants.expoGoConfig = {}
    const { result } = await renderUseAdMob()

    await result.initialize()
    await result.showInterstitialIfDue()

    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.createInterstitial).not.toHaveBeenCalled()
  })

  it('falls back to test ids in development when useTestIds is not configured', async () => {
    mocks.constants.expoConfig.extra = {
      adMob: {
        androidInterstitialId: 'prod-interstitial',
      },
    }
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    const interstitialAttempt = result.showInterstitialIfDue()
    await Promise.resolve()
    expect(mocks.createInterstitial).toHaveBeenCalledWith('test-interstitial')
    expect(mocks.createInterstitial).not.toHaveBeenCalledWith('prod-interstitial')
    mocks.state.interstitials[0]?.emit('loaded')
    await Promise.resolve()
    mocks.state.interstitials[0]?.emit('closed')
    await interstitialAttempt
  })

  it('does not request an ad when production ids are missing', async () => {
    mocks.constants.expoConfig.extra = {
      adMob: {
        useTestIds: false,
        androidInterstitialId: null,
      },
    }
    const { result } = await renderUseAdMob()

    await TestRenderer.act(async () => {
      await result.initialize()
    })

    await result.showInterstitialIfDue()

    expect(mocks.createInterstitial).not.toHaveBeenCalled()
  })

  it('disables ads for pro users', async () => {
    mocks.state.profile = createMockProfile({ hasProAccess: true })
    const { result } = await renderUseAdMob()

    await result.showInterstitialIfDue()
    expect(mocks.createInterstitial).not.toHaveBeenCalled()
  })
})
