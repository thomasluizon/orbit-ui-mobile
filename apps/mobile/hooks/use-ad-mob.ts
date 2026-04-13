import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import mobileAds, {
  AdEventType,
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

// Replace these placeholders with your real AdMob unit IDs before going live.
const PROD_INTERSTITIAL_ID = TEST_INTERSTITIAL_ID
const PROD_REWARDED_ID = TEST_REWARDED_ID

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

function getAdUnitId(testId: string, productionId: string) {
  return __DEV__ ? testId : productionId
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

  initializationPromise = mobileAds()
    .initialize()
    .then(() => {
      setInitializedState(true)
      return true
    })
    .catch(() => false)
    .finally(() => {
      initializationPromise = null
    })

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

    completionCount += 1
    if (
      completionCount !== 1 &&
      (completionCount - 1) % INTERSTITIAL_INTERVAL !== 0
    ) {
      return
    }

    const interstitial = InterstitialAd.createForAdRequest(
      getAdUnitId(TEST_INTERSTITIAL_ID, PROD_INTERSTITIAL_ID),
    )

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

    const rewardedAd = RewardedAd.createForAdRequest(
      getAdUnitId(TEST_REWARDED_ID, PROD_REWARDED_ID),
    )

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
