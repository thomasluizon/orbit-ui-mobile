import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { APP_STORE_PRODUCT_IDS } from '@/lib/store-products'
import { capturePurchase } from '@/lib/posthog'
import { useQueryClient } from '@tanstack/react-query'
import {
  ErrorCode,
  finishTransaction,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  getTransactionJwsIOS,
  syncIOS,
  useIAP,
  type Purchase,
} from 'expo-iap'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import type { Profile, SubscriptionInterval } from '@orbit/shared/types/profile'
import {
  PLAY_REFERRAL_OFFER_TAG,
  PLAY_SUBSCRIPTION_PRODUCT_ID,
  playBasePlanToInterval,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getAccountId } from '@/lib/account-scope'
import { useAuthStore } from '@/stores/auth-store'

const STORE_CONNECTION_TIMEOUT_MS = 10_000

export interface StoreOffer {
  interval: SubscriptionInterval
  sku: string
  offerToken?: string
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

interface StoreOfferSource {
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

type StoreOfferSourceEntry = NonNullable<StoreOfferSource['subscriptionOffers']>[number]

function toStoreOffer(offer: StoreOfferSourceEntry, subscriptionId: string): StoreOffer | null {
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
export function extractStoreOffers(subscriptions: StoreOfferSource[]): StoreOffer[] {
  const offers: StoreOffer[] = []
  for (const subscription of subscriptions) {
    for (const offer of subscription.subscriptionOffers ?? []) {
      const playOffer = toStoreOffer(offer, subscription.id)
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
export function selectStoreOffer(
  offers: StoreOffer[],
  interval: SubscriptionInterval,
  preferReferral: boolean,
): StoreOffer | null {
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

const pendingStoreVerifications = new Map<string, Promise<boolean>>()

function verifyStorePurchase(purchase: Purchase, isCurrent: () => boolean): Promise<boolean> {
  const transaction = Platform.OS === 'ios' ? purchase.id : purchase.purchaseToken
  const key = `${getAccountGeneration()}:${transaction}`
  const pending = pendingStoreVerifications.get(key)
  if (pending) return pending
  const operation = verifyNativePurchase(purchase, isCurrent).finally(() => pendingStoreVerifications.delete(key))
  pendingStoreVerifications.set(key, operation)
  return operation
}

async function verifyNativePurchase(purchase: Purchase, isCurrent: () => boolean): Promise<boolean> {
  const purchaseToken = Platform.OS === 'ios' ? await getTransactionJwsIOS(purchase.productId) : purchase.purchaseToken
  if (!purchaseToken || !isCurrent()) return false
  await apiClient(Platform.OS === 'ios' ? API.subscription.appStoreVerify : API.subscription.playVerify, {
    method: 'POST',
    isCurrent,
    body: JSON.stringify(Platform.OS === 'ios'
      ? { signedTransaction: purchaseToken }
      : { productId: purchase.productId, purchaseToken }),
  })
  if (!isCurrent()) return false
  capturePurchase('purchase_verified', Platform.OS === 'ios' ? 'app_store' : 'play')
  await finishTransaction({ purchase, isConsumable: false })
  return true
}

async function verifyOwnedPurchases(purchases: Purchase[], isCurrent: () => boolean) {
  let restored = false
  let failed = false
  for (const owned of purchases) {
    if (!isCurrent()) break
    try {
      // react-doctor-disable-next-line async-await-in-loop -- Store transaction acknowledgements mutate the billing client and must settle sequentially. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      if (await verifyStorePurchase(owned, isCurrent)) restored = true
      else failed = true
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
 * Native store subscription purchasing for the mobile app: connects to native billing,
 * exposes localized offers per interval, runs the purchase sheet, verifies the purchase
 * server-side, and restores previous purchases. The platform selects its native store.
 */
export function useStoreBillingConnection(options?: { preferReferralOffer?: boolean; onPurchased?: () => Promise<void> | void }) {
  const preferReferralOffer = Platform.OS !== 'ios' && (options?.preferReferralOffer ?? false)
  const isApple = Platform.OS === 'ios'
  const purchaseBusy = useRef(false)
  const restoreBusy = useRef(false)
  const recoveryAccount = useRef<string | null>(null)
  const onPurchased = options?.onPurchased
  const queryClient = useQueryClient()
  const purchaseAccount = useRef({ id: getAccountId(), generation: getAccountGeneration() })
  const userId = useAuthStore((state) => state.user?.userId)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [pendingVerifications, setPendingVerifications] = useState(0)
  const [isRestoring, setIsRestoring] = useState(false)
  const [productQueryState, setProductQueryState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [productQueryAttempt, setProductQueryAttempt] = useState(0)
  const [billingUserId, setBillingUserId] = useState(userId)
  const previousUserId = useRef(userId)
  if (billingUserId !== userId) {
    setBillingUserId(userId)
    setErrorKey(null)
    setPendingVerifications(0)
    setIsRestoring(false)
  }


  const errorPrefix = isApple ? 'upgrade.appStore.error' : 'upgrade.playError'

  const beginVerification = useCallback(() => setPendingVerifications((count) => count + 1), [])
  const endVerification = useCallback(
    () => setPendingVerifications((count) => Math.max(0, count - 1)),
    [],
  )

  const invalidateEntitlement = useCallback(async (account: { id: string | null; generation: number }) => {
    if (!isPurchaseAccountCurrent(account)) return
    await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }, { throwOnError: true })
    if (!isPurchaseAccountCurrent(account)) return
    await queryClient.fetchQuery({ queryKey: profileKeys.detail(), queryFn: () => apiClient<Profile>(API.profile.get), staleTime: 0 })
  }, [queryClient])

  const { connected, subscriptions, fetchProducts, requestPurchase, reconnect } = useIAP({
    onError: () => {
      if (!connected) setProductQueryState('failed')
    },
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        const account = purchaseAccount.current
        try {
          if (!account.id || !isPurchaseAccountCurrent(account)) return
          if (!await verifyStorePurchase(purchase, () => isPurchaseAccountCurrent(account))) throw new Error('Missing store transaction')
          if (!isPurchaseAccountCurrent(account)) return
          await invalidateEntitlement(account)
          if (isPurchaseAccountCurrent(account)) await onPurchased?.()
        } catch {
          if (isPurchaseAccountCurrent(account)) setErrorKey(`${errorPrefix}.serviceUnavailable`)
        } finally {
          if (isPurchaseAccountCurrent(account)) { purchaseBusy.current = false; endVerification() }
        }
      })()
    },
    onPurchaseError: (error) => {
      if (!isPurchaseAccountCurrent(purchaseAccount.current)) return
      purchaseBusy.current = false
      endVerification()
      setErrorKey(mapPlayErrorKey(error)?.replace('upgrade.playError', errorPrefix) ?? null)
    },
  })

  useEffect(() => {
    let active = true
    const connectionTimeout = !connected
      ? setTimeout(() => { if (active) setProductQueryState('failed') }, STORE_CONNECTION_TIMEOUT_MS)
      : undefined
    void Promise.resolve().then(() => {
      if (!active) return
      if (!connected) {
        if (productQueryAttempt > 0) {
          void reconnect().then(
            (success) => { if (!success && active) setProductQueryState('failed') },
            () => { if (active) setProductQueryState('failed') },
          )
        }
        return
      }
      setProductQueryState('loading')
      const skus = isApple ? Object.values(APP_STORE_PRODUCT_IDS).filter(Boolean) : [PLAY_SUBSCRIPTION_PRODUCT_ID]
      if (skus.length === 0) { setProductQueryState('failed'); return }
      return fetchProducts({ skus, type: 'subs' }).then(
        () => { if (active) setProductQueryState('ready') },
        () => { if (active) setProductQueryState('failed') },
      )
    })
    return () => {
      active = false
      clearTimeout(connectionTimeout)
    }
  }, [connected, fetchProducts, reconnect, productQueryAttempt, isApple])

  const retryProducts = useCallback(() => {
    setProductQueryState('loading')
    setProductQueryAttempt((attempt) => attempt + 1)
  }, [])

  const offers = useMemo(() => isApple ? subscriptions.flatMap((subscription): StoreOffer[] => {
    const interval = subscription.id === APP_STORE_PRODUCT_IDS.monthly ? 'monthly'
      : subscription.id === APP_STORE_PRODUCT_IDS.yearly ? 'yearly' : null
    if (!interval) return []
    return [{ interval, sku: subscription.id, displayPrice: subscription.displayPrice,
      isReferral: false, priceAmountMicros: subscription.price == null ? null : String(Math.round(subscription.price * 1_000_000)), currency: subscription.currency }]
  }) : extractStoreOffers(subscriptions), [subscriptions, isApple])

  const purchase = useCallback(
    async (interval: SubscriptionInterval, preferReferral = preferReferralOffer): Promise<boolean> => {
      if (purchaseBusy.current || restoreBusy.current) return false
      const offer = selectStoreOffer(offers, interval, !isApple && preferReferral)
      if (!offer) {
        setErrorKey(`${errorPrefix}.unavailable`)
        return false
      }
      if (!userId) {
        setErrorKey(`${errorPrefix}.notSignedIn`)
        return false
      }
      purchaseBusy.current = true
      setErrorKey(null)
      capturePurchase('purchase_started', isApple ? 'app_store' : 'play')
      const account = { id: getAccountId(), generation: getAccountGeneration() }
      purchaseAccount.current = account
      beginVerification()
      try {
        await requestPurchase({
          request: isApple ? { apple: { sku: offer.sku, appAccountToken: userId } } : {
            google: {
              skus: [offer.sku],
              subscriptionOffers: [{ sku: offer.sku, offerToken: offer.offerToken! }],
              obfuscatedAccountId: userId,
            },
          },
          type: 'subs',
        })
        return true
      } catch (error) {
        if (!isPurchaseAccountCurrent(account)) return false
        purchaseBusy.current = false
        endVerification()
        setErrorKey(
          error && typeof error === 'object' && 'code' in error
            ? mapPlayErrorKey(error as { code?: ErrorCode })?.replace('upgrade.playError', errorPrefix) ?? null
            : `${errorPrefix}.unavailable`,
        )
        return false
      }
    },
    [beginVerification, endVerification, errorPrefix, isApple, offers, preferReferralOffer, requestPurchase, userId],
  )

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (purchaseBusy.current || restoreBusy.current) return false
    restoreBusy.current = true
    setErrorKey(null)
    setIsRestoring(true)
    const account = { id: getAccountId(), generation: getAccountGeneration() }
    try {
      if (isApple) await syncIOS()
      if (!isPurchaseAccountCurrent(account)) return false
      const purchases = await getAvailablePurchases()
      if (!isPurchaseAccountCurrent(account)) return false
      const orbitPurchases = purchases.filter(
        (owned) => isApple ? Object.values(APP_STORE_PRODUCT_IDS).includes(owned.productId) : owned.productId === PLAY_SUBSCRIPTION_PRODUCT_ID,
      )
      const { restored, failed } = await verifyOwnedPurchases(orbitPurchases, () => isPurchaseAccountCurrent(account))
      if (!isPurchaseAccountCurrent(account)) return false
      if (restored) {
        await invalidateEntitlement(account)
        if (!isPurchaseAccountCurrent(account)) return false
        await onPurchased?.()
      }
      if (failed) setErrorKey(`${errorPrefix}.serviceUnavailable`)
      else if (!restored) setErrorKey(`${errorPrefix}.nothingToRestore`)
      return restored
    } catch {
      if (isPurchaseAccountCurrent(account)) setErrorKey(`${errorPrefix}.serviceUnavailable`)
      return false
    } finally {
      if (isPurchaseAccountCurrent(account)) { restoreBusy.current = false; setIsRestoring(false) }
    }
  }, [errorPrefix, invalidateEntitlement, isApple, onPurchased])

  useEffect(() => {
    if (previousUserId.current === userId) return
    previousUserId.current = userId
    purchaseAccount.current = { id: getAccountId(), generation: getAccountGeneration() }
    purchaseBusy.current = false
    restoreBusy.current = false
  }, [userId])

  useEffect(() => {
    if (!userId) { recoveryAccount.current = null; return }
    if (!isApple || !connected || recoveryAccount.current === userId) return
    recoveryAccount.current = userId
    restoreBusy.current = true
    const account = { id: getAccountId(), generation: getAccountGeneration() }
    void Promise.resolve().then(() => {
      if (!isPurchaseAccountCurrent(account)) return []
      setIsRestoring(true)
      return getPendingTransactionsIOS()
    }).then(async (purchases) => {
      const owned = purchases.filter((purchase) => Object.values(APP_STORE_PRODUCT_IDS).includes(purchase.productId))
      const { restored, failed } = await verifyOwnedPurchases(owned, () => isPurchaseAccountCurrent(account))
      if (!isPurchaseAccountCurrent(account)) return
      if (restored) await invalidateEntitlement(account)
      if (failed) setErrorKey('upgrade.appStore.error.serviceUnavailable')
    }).catch(() => { if (isPurchaseAccountCurrent(account)) setErrorKey('upgrade.appStore.error.serviceUnavailable') })
      .finally(() => {
        if (isPurchaseAccountCurrent(account)) { restoreBusy.current = false; setIsRestoring(false) }
      })
  }, [connected, invalidateEntitlement, isApple, userId])

  const clearError = useCallback(() => setErrorKey(null), [])

  const monthlyOffer = selectStoreOffer(offers, 'monthly', preferReferralOffer)
  const yearlyOffer = selectStoreOffer(offers, 'yearly', preferReferralOffer)

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
    isLoadingProducts: productQueryState === 'loading',
    isProductsError: productQueryState === 'failed',
    retryProducts,
    errorKey,
    clearError,
  }
}
