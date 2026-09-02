import { useCallback } from 'react'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  TestIds,
} from 'react-native-google-mobile-ads'
import { useProfile } from '@/hooks/use-profile'

const INTERSTITIAL_INTERVAL = 3

const TEST_INTERSTITIAL_ID = TestIds.INTERSTITIAL
type AdMobExtra = {
  useTestIds?: boolean
  androidInterstitialId?: string | null
  iosInterstitialId?: string | null
}

let isInitializedState = false
let initializationPromise: Promise<boolean> | null = null
let completionCount = 0

function setInitializedState(nextValue: boolean) {
  isInitializedState = nextValue
}

function canUseNativeAds() {
  return Platform.OS !== 'web' && Constants.expoGoConfig === null
}

type ConstantsWithAdMobConfig = {
  expoConfig: { extra?: { adMob?: AdMobExtra } } | null
}

function getAdMobConfig(): AdMobExtra {
  const { expoConfig } = Constants as ConstantsWithAdMobConfig

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

function getProductionAdUnitId() {
  const adMobConfig = getAdMobConfig()

  if (Platform.OS === 'ios') {
    return adMobConfig.iosInterstitialId ?? null
  }

  return adMobConfig.androidInterstitialId ?? null
}

function getAdUnitId() {
  if (shouldUseTestIds()) {
    return TEST_INTERSTITIAL_ID
  }

  return getProductionAdUnitId()
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

    const interstitialAdUnitId = getAdUnitId()
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
          interstitial.show().catch(settle)
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

  return {
    initialize,
    showInterstitialIfDue,
  }
}
