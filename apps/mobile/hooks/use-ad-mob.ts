import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'

const INTERSTITIAL_INTERVAL = 3
const DAILY_REWARD_CAP = 3

const TEST_INTERSTITIAL_ID = TestIds.INTERSTITIAL
const TEST_REWARDED_ID = TestIds.REWARDED
type AdUnitKind = 'interstitial' | 'rewarded'
type AdMobExtra = {
  useTestIds?: boolean
  androidInterstitialId?: string | null
  androidRewardedId?: string | null
  iosInterstitialId?: string | null
  iosRewardedId?: string | null
}

let isInitializedState = false
let initializationPromise: Promise<boolean> | null = null
let completionCount = 0

const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach((subscriber) => subscriber())
}

function setInitializedState(nextValue: boolean) {
  if (isInitializedState === nextValue) {
    return
  }

  isInitializedState = nextValue
  notifySubscribers()
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

function getInitializedSnapshot() {
  return isInitializedState
}

function canUseNativeAds() {
  return Platform.OS !== 'web' && Constants.appOwnership !== 'expo'
}

function getAdMobConfig(): AdMobExtra {
  const expoConfig = (Constants as typeof Constants & {
    expoConfig?: {
      extra?: {
        adMob?: AdMobExtra
      }
    }
  }).expoConfig

  return expoConfig?.extra?.adMob ?? {}
}

function shouldUseTestIds() {
  const configuredValue = getAdMobConfig().useTestIds

  if (configuredValue === true) {
    return true
  }

  if (configuredValue === false) {
    return false
  }

  return __DEV__
}

function getProductionAdUnitId(adUnitKind: AdUnitKind) {
  const adMobConfig = getAdMobConfig()

  if (Platform.OS === 'ios') {
    return adUnitKind === 'interstitial'
      ? adMobConfig.iosInterstitialId ?? null
      : adMobConfig.iosRewardedId ?? null
  }

  return adUnitKind === 'interstitial'
    ? adMobConfig.androidInterstitialId ?? null
    : adMobConfig.androidRewardedId ?? null
}

function getAdUnitId(adUnitKind: AdUnitKind) {
  if (shouldUseTestIds()) {
    return adUnitKind === 'interstitial'
      ? TEST_INTERSTITIAL_ID
      : TEST_REWARDED_ID
  }

  return getProductionAdUnitId(adUnitKind)
}

async function canRequestAds() {
  try {
    await AdsConsent.gatherConsent()
  } catch {}

  try {
    const consentInfo = await AdsConsent.getConsentInfo()
    return consentInfo.canRequestAds
  } catch {
    return true
  }
}

async function ensureInitialized(): Promise<boolean> {
  if (!canUseNativeAds()) {
    return false
  }

  if (isInitializedState) {
    return true
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    const requestable = await canRequestAds()
    if (!requestable) {
      return false
    }

    try {
      await mobileAds().initialize()
      setInitializedState(true)
      return true
    } catch {
      return false
    } finally {
      initializationPromise = null
    }
  })()

  return initializationPromise
}

export function useAdMob() {
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  const isInitialized = useSyncExternalStore(
    subscribe,
    getInitializedSnapshot,
    getInitializedSnapshot,
  )

  const shouldShowAds = useCallback(() => {
    if (!canUseNativeAds()) {
      return false
    }

    return !profile?.hasProAccess && !profile?.isTrialActive
  }, [profile?.hasProAccess, profile?.isTrialActive])

  const initialize = useCallback(async () => {
    await ensureInitialized()
  }, [])

  const showInterstitialIfDue = useCallback(async () => {
    if (!shouldShowAds()) {
      return
    }

    const ready = await ensureInitialized()
    if (!ready) {
      return
    }

    const interstitialAdUnitId = getAdUnitId('interstitial')
    if (!interstitialAdUnitId) {
      return
    }

    completionCount += 1
    if (
      completionCount !== 1 &&
      (completionCount - 1) % INTERSTITIAL_INTERVAL !== 0
    ) {
      return
    }

    const interstitial = InterstitialAd.createForAdRequest(interstitialAdUnitId)

    await new Promise<void>((resolve) => {
      let settled = false

      const settle = () => {
        if (settled) {
          return
        }

        settled = true
        unsubscribeLoaded()
        unsubscribeClosed()
        unsubscribeError()
        resolve()
      }

      const unsubscribeLoaded = interstitial.addAdEventListener(
        AdEventType.LOADED,
        () => {
          interstitial.show().catch(() => {
            settle()
          })
        },
      )
      const unsubscribeClosed = interstitial.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          settle()
        },
      )
      const unsubscribeError = interstitial.addAdEventListener(
        AdEventType.ERROR,
        () => {
          settle()
        },
      )

      try {
        interstitial.load()
      } catch {
        settle()
      }
    })
  }, [shouldShowAds])

  const showRewardedAd = useCallback(async () => {
    if (!shouldShowAds()) {
      return false
    }

    const ready = await ensureInitialized()
    if (!ready) {
      return false
    }

    const rewardedAdUnitId = getAdUnitId('rewarded')
    if (!rewardedAdUnitId) {
      return false
    }

    const rewardedAd = RewardedAd.createForAdRequest(rewardedAdUnitId)

    return new Promise<boolean>((resolve) => {
      let settled = false
      let earnedReward = false

      const settle = (result: boolean) => {
        if (settled) {
          return
        }

        settled = true
        unsubscribeLoaded()
        unsubscribeClosed()
        unsubscribeError()
        unsubscribeReward()
        resolve(result)
      }

      const unsubscribeLoaded = rewardedAd.addAdEventListener(
        AdEventType.LOADED,
        () => {
          rewardedAd.show().catch(() => {
            settle(false)
          })
        },
      )
      const unsubscribeClosed = rewardedAd.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          settle(earnedReward)
        },
      )
      const unsubscribeError = rewardedAd.addAdEventListener(
        AdEventType.ERROR,
        () => {
          settle(false)
        },
      )
      const unsubscribeReward = rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earnedReward = true
        },
      )

      try {
        rewardedAd.load()
      } catch {
        settle(false)
      }
    })
  }, [shouldShowAds])

  const rewardsClaimedToday = profile?.adRewardsClaimedToday ?? 0
  const canClaimReward = rewardsClaimedToday < DAILY_REWARD_CAP

  const markRewardClaimed = useCallback(() => {
    queryClient.setQueryData<Profile | undefined>(
      profileKeys.detail(),
      (current) =>
        current
          ? {
              ...current,
              adRewardsClaimedToday: (current.adRewardsClaimedToday ?? 0) + 1,
            }
          : current,
    )
  }, [queryClient])

  return {
    isInitialized,
    canClaimReward,
    rewardsClaimedToday,
    dailyRewardCap: DAILY_REWARD_CAP,
    shouldShowAds,
    initialize,
    showInterstitialIfDue,
    showRewardedAd,
    markRewardClaimed,
  }
}
