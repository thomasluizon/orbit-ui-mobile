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
import { PLAY_SUBSCRIPTION_PRODUCT_ID, playBasePlanToInterval } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

export interface PlayOffer {
  interval: SubscriptionInterval
  sku: string
  offerToken: string
  displayPrice: string
}

interface PlayOfferSource {
  id: string
  subscriptionOffers?:
    | { basePlanIdAndroid?: string | null; offerTokenAndroid?: string | null; displayPrice: string }[]
    | null
}

/** Flattens the fetched Play subscription product into one offer per interval (first match wins). */
export function extractPlayOffers(subscriptions: PlayOfferSource[]): PlayOffer[] {
  const offers: PlayOffer[] = []
  for (const subscription of subscriptions) {
    for (const offer of subscription.subscriptionOffers ?? []) {
      const interval = offer.basePlanIdAndroid ? playBasePlanToInterval(offer.basePlanIdAndroid) : null
      if (!interval || !offer.offerTokenAndroid) continue
      if (offers.some((existing) => existing.interval === interval)) continue
      offers.push({
        interval,
        sku: subscription.id,
        offerToken: offer.offerTokenAndroid,
        displayPrice: offer.displayPrice,
      })
    }
  }
  return offers
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
 */
export function usePlayBilling() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.user?.userId)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

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
          setIsProcessing(false)
        }
      })()
    },
    onPurchaseError: (error) => {
      setIsProcessing(false)
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
      const offer = offers.find((candidate) => candidate.interval === interval)
      if (!offer) {
        setErrorKey('upgrade.playError.unavailable')
        return
      }
      setErrorKey(null)
      setIsProcessing(true)
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
        setIsProcessing(false)
        setErrorKey(
          error && typeof error === 'object' && 'code' in error
            ? mapPlayErrorKey(error as { code?: ErrorCode })
            : 'upgrade.playError.unavailable',
        )
      }
    },
    [offers, requestPurchase, userId],
  )

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setErrorKey(null)
    setIsProcessing(true)
    try {
      const purchases = await getAvailablePurchases()
      let restored = false
      for (const owned of purchases) {
        if (await verifyPlayPurchase(owned)) restored = true
      }
      if (restored) await invalidateEntitlement()
      return restored
    } catch {
      setErrorKey('upgrade.playError.serviceUnavailable')
      return false
    } finally {
      setIsProcessing(false)
    }
  }, [invalidateEntitlement])

  const clearError = useCallback(() => setErrorKey(null), [])

  return {
    connected,
    offers,
    monthlyOffer: offers.find((offer) => offer.interval === 'monthly') ?? null,
    yearlyOffer: offers.find((offer) => offer.interval === 'yearly') ?? null,
    purchase,
    restorePurchases,
    isProcessing,
    errorKey,
    clearError,
  }
}
