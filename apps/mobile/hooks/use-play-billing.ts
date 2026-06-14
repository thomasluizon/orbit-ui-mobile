import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ErrorCode,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
  type Purchase,
} from 'expo-iap'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import type { SubscriptionInterval } from '@orbit/shared/types/profile'
import {
  PLAY_REFERRAL_OFFER_TAG,
  PLAY_SUBSCRIPTION_PRODUCT_ID,
  playBasePlanToInterval,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

export interface PlayOffer {
  interval: SubscriptionInterval
  sku: string
  offerToken: string
  displayPrice: string
  isReferral: boolean
  priceAmountMicros: string | null
  currency: string | null
}

interface PlayPricingPhaseSource {
  formattedPrice: string
  priceAmountMicros: string
  priceCurrencyCode: string
}

interface PlayOfferSource {
  id: string
  subscriptionOffers?:
    | {
        basePlanIdAndroid?: string | null
        offerTokenAndroid?: string | null
        offerTagsAndroid?: string[] | null
        displayPrice: string
        pricingPhasesAndroid?: { pricingPhaseList: PlayPricingPhaseSource[] } | null
      }[]
    | null
}

/**
 * Flattens the fetched Play subscription product into at most one base offer and one
 * referral-tagged offer per interval (first match wins). A referral offer is priced from its
 * first pricing phase — the discounted cycle — so the displayed price equals the charged price.
 */
export function extractPlayOffers(subscriptions: PlayOfferSource[]): PlayOffer[] {
  const offers: PlayOffer[] = []
  for (const subscription of subscriptions) {
    for (const offer of subscription.subscriptionOffers ?? []) {
      const interval = offer.basePlanIdAndroid ? playBasePlanToInterval(offer.basePlanIdAndroid) : null
      if (!interval || !offer.offerTokenAndroid) continue
      const isReferral = offer.offerTagsAndroid?.includes(PLAY_REFERRAL_OFFER_TAG) ?? false
      if (offers.some((existing) => existing.interval === interval && existing.isReferral === isReferral)) continue
      const firstPhase = offer.pricingPhasesAndroid?.pricingPhaseList[0] ?? null
      offers.push({
        interval,
        sku: subscription.id,
        offerToken: offer.offerTokenAndroid,
        displayPrice: isReferral && firstPhase ? firstPhase.formattedPrice : offer.displayPrice,
        isReferral,
        priceAmountMicros: firstPhase?.priceAmountMicros ?? null,
        currency: firstPhase?.priceCurrencyCode ?? null,
      })
    }
  }
  return offers
}

/** Picks the offer to display and purchase for an interval: the referral offer when preferred and available, else the base offer. */
export function selectPlayOffer(
  offers: PlayOffer[],
  interval: SubscriptionInterval,
  preferReferral: boolean,
): PlayOffer | null {
  const candidates = offers.filter((offer) => offer.interval === interval)
  if (preferReferral) {
    const referralOffer = candidates.find((offer) => offer.isReferral)
    if (referralOffer) return referralOffer
  }
  return candidates.find((offer) => !offer.isReferral) ?? null
}

/** Maps an expo-iap purchase error to a user-facing i18n key, or null when the user cancelled. */
export function mapPlayErrorKey(error: { code?: ErrorCode }): string | null {
  switch (error.code) {
    case ErrorCode.UserCancelled:
      return null
    case ErrorCode.AlreadyOwned:
      return 'upgrade.playError.alreadyOwned'
    case ErrorCode.DeferredPayment:
    case ErrorCode.Pending:
      return 'upgrade.playError.pending'
    case ErrorCode.FeatureNotSupported:
      return 'upgrade.playError.deviceNotSupported'
    case ErrorCode.NetworkError:
    case ErrorCode.ServiceError:
    case ErrorCode.ServiceDisconnected:
      return 'upgrade.playError.serviceUnavailable'
    default:
      return 'upgrade.playError.unavailable'
  }
}

async function verifyPlayPurchase(purchase: Purchase): Promise<boolean> {
  const purchaseToken = purchase.purchaseToken
  if (!purchaseToken) return false
  await apiClient(API.subscription.playVerify, {
    method: 'POST',
    body: JSON.stringify({ productId: purchase.productId, purchaseToken }),
  })
  await finishTransaction({ purchase, isConsumable: false })
  return true
}

/**
 * Native Google Play subscription purchasing for the mobile app: connects to Play Billing,
 * exposes localized offers per interval, runs the purchase sheet, verifies the purchase
 * server-side, and restores previous purchases. Android-only; the web app uses Stripe.
 * Pass preferReferralOffer when the backend reports an unused referral coupon so the
 * referral-tagged discount offer is displayed and purchased instead of the base plan.
 */
export function usePlayBilling(options?: { preferReferralOffer?: boolean }) {
  const preferReferralOffer = options?.preferReferralOffer ?? false
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.userId)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [pendingVerifications, setPendingVerifications] = useState(0)
  const [isRestoring, setIsRestoring] = useState(false)

  const beginVerification = useCallback(() => setPendingVerifications((count) => count + 1), [])
  const endVerification = useCallback(
    () => setPendingVerifications((count) => Math.max(0, count - 1)),
    [],
  )

  const invalidateEntitlement = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
    await queryClient.invalidateQueries({ queryKey: profileKeys.all })
  }, [queryClient])

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        try {
          await verifyPlayPurchase(purchase)
          await invalidateEntitlement()
        } catch {
          setErrorKey('upgrade.playError.serviceUnavailable')
        } finally {
          endVerification()
        }
      })()
    },
    onPurchaseError: (error) => {
      endVerification()
      setErrorKey(mapPlayErrorKey(error))
    },
  })

  useEffect(() => {
    if (connected) {
      void fetchProducts({ skus: [PLAY_SUBSCRIPTION_PRODUCT_ID], type: 'subs' })
    }
  }, [connected, fetchProducts])

  const offers = useMemo(() => extractPlayOffers(subscriptions), [subscriptions])

  const purchase = useCallback(
    async (interval: SubscriptionInterval) => {
      const offer = selectPlayOffer(offers, interval, preferReferralOffer)
      if (!offer) {
        setErrorKey('upgrade.playError.unavailable')
        return
      }
      if (!userId) {
        setErrorKey('upgrade.playError.notSignedIn')
        return
      }
      setErrorKey(null)
      beginVerification()
      try {
        await requestPurchase({
          request: {
            google: {
              skus: [offer.sku],
              subscriptionOffers: [{ sku: offer.sku, offerToken: offer.offerToken }],
              obfuscatedAccountId: userId,
            },
          },
          type: 'subs',
        })
      } catch (error) {
        endVerification()
        setErrorKey(
          error && typeof error === 'object' && 'code' in error
            ? mapPlayErrorKey(error as { code?: ErrorCode })
            : 'upgrade.playError.unavailable',
        )
      }
    },
    [beginVerification, endVerification, offers, preferReferralOffer, requestPurchase, userId],
  )

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setErrorKey(null)
    setIsRestoring(true)
    try {
      const purchases = await getAvailablePurchases()
      const orbitPurchases = purchases.filter(
        (owned) => owned.productId === PLAY_SUBSCRIPTION_PRODUCT_ID,
      )
      let restored = false
      let failed = false
      for (const owned of orbitPurchases) {
        try {
          if (await verifyPlayPurchase(owned)) restored = true
        } catch {
          failed = true
        }
      }
      if (restored) await invalidateEntitlement()
      else if (failed) setErrorKey('upgrade.playError.serviceUnavailable')
      else setErrorKey('upgrade.playError.nothingToRestore')
      return restored
    } catch {
      setErrorKey('upgrade.playError.serviceUnavailable')
      return false
    } finally {
      setIsRestoring(false)
    }
  }, [invalidateEntitlement])

  const clearError = useCallback(() => setErrorKey(null), [])

  const monthlyOffer = selectPlayOffer(offers, 'monthly', preferReferralOffer)
  const yearlyOffer = selectPlayOffer(offers, 'yearly', preferReferralOffer)

  return {
    connected,
    offers,
    monthlyOffer,
    yearlyOffer,
    isReferralPricing: Boolean(monthlyOffer?.isReferral || yearlyOffer?.isReferral),
    purchase,
    restorePurchases,
    isProcessing: pendingVerifications > 0,
    isRestoring,
    errorKey,
    clearError,
  }
}
