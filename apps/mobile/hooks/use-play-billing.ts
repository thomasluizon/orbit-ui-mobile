import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { getAccountGeneration } from '@/lib/session-epoch'
import { getAccountId } from '@/lib/account-scope'
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

type PlayOfferSourceEntry = NonNullable<PlayOfferSource['subscriptionOffers']>[number]

function toPlayOffer(offer: PlayOfferSourceEntry, subscriptionId: string): PlayOffer | null {
  const interval = offer.basePlanIdAndroid ? playBasePlanToInterval(offer.basePlanIdAndroid) : null
  if (!interval || !offer.offerTokenAndroid) return null
  const isReferral = offer.offerTagsAndroid?.includes(PLAY_REFERRAL_OFFER_TAG) ?? false
  const firstPhase = offer.pricingPhasesAndroid?.pricingPhaseList[0] ?? null
  return {
    interval,
    sku: subscriptionId,
    offerToken: offer.offerTokenAndroid,
    displayPrice: isReferral && firstPhase ? firstPhase.formattedPrice : offer.displayPrice,
    isReferral,
    priceAmountMicros: firstPhase?.priceAmountMicros ?? null,
    currency: firstPhase?.priceCurrencyCode ?? null,
  }
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
      const playOffer = toPlayOffer(offer, subscription.id)
      if (!playOffer) continue
      const isDuplicate = offers.some(
        (existing) =>
          existing.interval === playOffer.interval && existing.isReferral === playOffer.isReferral,
      )
      if (!isDuplicate) offers.push(playOffer)
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

async function verifyPlayPurchase(purchase: Purchase, isCurrent: () => boolean): Promise<boolean> {
  const purchaseToken = purchase.purchaseToken
  if (!purchaseToken) return false
  await apiClient(API.subscription.playVerify, {
    method: 'POST',
    isCurrent,
    body: JSON.stringify({ productId: purchase.productId, purchaseToken }),
  })
  if (!isCurrent()) return false
  await finishTransaction({ purchase, isConsumable: false })
  return true
}

async function verifyOwnedPurchases(purchases: Purchase[], isCurrent: () => boolean) {
  let restored = false
  let failed = false
  for (const owned of purchases) {
    if (!isCurrent()) break
    try {
      // react-doctor-disable-next-line async-await-in-loop -- Play transaction acknowledgements mutate the billing client and must settle sequentially. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      if (await verifyPlayPurchase(owned, isCurrent)) restored = true
    } catch {
      failed = true
    }
  }
  return { restored, failed }
}

function isPurchaseAccountCurrent(account: { id: string | null; generation: number }) {
  return account.id === getAccountId() && account.generation === getAccountGeneration()
}

/**
 * Native Google Play subscription purchasing for the mobile app: connects to Play Billing,
 * exposes localized offers per interval, runs the purchase sheet, verifies the purchase
 * server-side, and restores previous purchases. Android-only; the web app uses Stripe.
 */
export function usePlayBilling(options?: { preferReferralOffer?: boolean; onPurchased?: () => Promise<void> | void }) {
  const preferReferralOffer = options?.preferReferralOffer ?? false
  const onPurchased = options?.onPurchased
  const queryClient = useQueryClient()
  const purchaseAccount = useRef({ id: getAccountId(), generation: getAccountGeneration() })
  const userId = useAuthStore((state) => state.user?.userId)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [pendingVerifications, setPendingVerifications] = useState(0)
  const [isRestoring, setIsRestoring] = useState(false)

  const beginVerification = useCallback(() => setPendingVerifications((count) => count + 1), [])
  const endVerification = useCallback(
    () => setPendingVerifications((count) => Math.max(0, count - 1)),
    [],
  )

  const invalidateEntitlement = useCallback(async (account: { id: string | null; generation: number }) => {
    if (!isPurchaseAccountCurrent(account)) return
    await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }, { throwOnError: true })
    if (!isPurchaseAccountCurrent(account)) return
    await queryClient.invalidateQueries({ queryKey: profileKeys.all }, { throwOnError: true })
  }, [queryClient])

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        const account = purchaseAccount.current
        try {
          if (!isPurchaseAccountCurrent(account)) return
          if (!await verifyPlayPurchase(purchase, () => isPurchaseAccountCurrent(account))) throw new Error('Missing Play purchase token')
          if (!isPurchaseAccountCurrent(account)) return
          await invalidateEntitlement(account)
          if (isPurchaseAccountCurrent(account)) await onPurchased?.()
        } catch {
          if (isPurchaseAccountCurrent(account)) setErrorKey('upgrade.playError.serviceUnavailable')
        } finally {
          endVerification()
        }
      })()
    },
    onPurchaseError: (error) => {
      endVerification()
      if (isPurchaseAccountCurrent(purchaseAccount.current)) setErrorKey(mapPlayErrorKey(error))
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
      const offer = selectPlayOffer(offers, interval, options?.preferReferralOffer ?? false)
      if (!offer) {
        setErrorKey('upgrade.playError.unavailable')
        return
      }
      if (!userId) {
        setErrorKey('upgrade.playError.notSignedIn')
        return
      }
      setErrorKey(null)
      purchaseAccount.current = { id: getAccountId(), generation: getAccountGeneration() }
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
    [beginVerification, endVerification, offers, options?.preferReferralOffer, requestPurchase, userId],
  )

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setErrorKey(null)
    setIsRestoring(true)
    const account = { id: getAccountId(), generation: getAccountGeneration() }
    try {
      const purchases = await getAvailablePurchases()
      if (!isPurchaseAccountCurrent(account)) return false
      const orbitPurchases = purchases.filter(
        (owned) => owned.productId === PLAY_SUBSCRIPTION_PRODUCT_ID,
      )
      const { restored, failed } = await verifyOwnedPurchases(orbitPurchases, () => isPurchaseAccountCurrent(account))
      if (!isPurchaseAccountCurrent(account)) return false
      if (restored) {
        await invalidateEntitlement(account)
        if (!isPurchaseAccountCurrent(account)) return false
        await onPurchased?.()
      } else if (failed) setErrorKey('upgrade.playError.serviceUnavailable')
      else setErrorKey('upgrade.playError.nothingToRestore')
      return restored
    } catch {
      if (isPurchaseAccountCurrent(account)) setErrorKey('upgrade.playError.serviceUnavailable')
      return false
    } finally {
      setIsRestoring(false)
    }
  }, [invalidateEntitlement, onPurchased])

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
