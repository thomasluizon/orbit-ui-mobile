import { setAccountId } from '@/lib/account-scope'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import React from 'react'
import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { ErrorCode, type Purchase } from 'expo-iap'
import { createApplePurchase, createPlayPurchase } from '../fixtures/store-purchases'

import {
  extractStoreOffers,
  mapPlayErrorKey,
  selectStoreOffer,
  useStoreBillingConnection as useStoreBilling,
  type StoreOffer,
} from '@/hooks/use-play-billing'

const TestRenderer = require('react-test-renderer')
const mountedViews: { unmount: () => void }[] = []

const mocks = vi.hoisted(() => {
  const state = {
    iapOptions: null as {
      onPurchaseSuccess?: (purchase: Purchase) => void
      onPurchaseError?: (error: unknown) => void
      onError?: (error: Error) => void
    } | null,
    subscriptions: [] as unknown[],
    connected: true,
    setConnected: null as ((connected: boolean) => void) | null,
    authUser: { userId: 'user-abc' } as { userId: string } | null,
  }
  return {
    state,
    apiClient: vi.fn(),
    finishTransaction: vi.fn(),
    getAvailablePurchases: vi.fn(),
    getPendingTransactionsIOS: vi.fn(),
    getTransactionJwsIOS: vi.fn(),
    syncIOS: vi.fn(),
    requestPurchase: vi.fn(),
    fetchProducts: vi.fn(),
    reconnect: vi.fn(),
    invalidateQueries: vi.fn(),
    fetchQuery: vi.fn(),
  }
})

vi.mock('expo-iap', () => ({
  ErrorCode: {
    UserCancelled: 'user-cancelled',
    AlreadyOwned: 'already-owned',
    DeferredPayment: 'deferred-payment',
    Pending: 'pending',
    FeatureNotSupported: 'feature-not-supported',
    NetworkError: 'network-error',
    ServiceError: 'service-error',
    ServiceDisconnected: 'service-disconnected',
    NotPrepared: 'not-prepared',
  },
  finishTransaction: mocks.finishTransaction,
  getAvailablePurchases: mocks.getAvailablePurchases,
  getPendingTransactionsIOS: mocks.getPendingTransactionsIOS,
  getTransactionJwsIOS: mocks.getTransactionJwsIOS,
  syncIOS: mocks.syncIOS,
  useIAP: (options: typeof mocks.state.iapOptions) => {
    const [connected, setConnected] = React.useState(mocks.state.connected)
    mocks.state.setConnected = setConnected
    mocks.state.iapOptions = options
    return {
      connected,
      subscriptions: mocks.state.subscriptions,
      fetchProducts: mocks.fetchProducts,
      requestPurchase: mocks.requestPurchase,
      reconnect: mocks.reconnect,
    }
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries, fetchQuery: mocks.fetchQuery }),
}))

vi.mock('@/lib/store-products', () => ({ APP_STORE_PRODUCT_IDS: { monthly: 'orbit.monthly', yearly: 'orbit.yearly' } }))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { userId: string } | null }) => unknown) =>
    selector({ user: mocks.state.authUser }),
}))

function renderUsePlayBilling(options?: { preferReferralOffer?: boolean; onPurchased?: () => Promise<void> | void }): ReturnType<typeof useStoreBilling> {
  const valueHolder: { current: ReturnType<typeof useStoreBilling> | null } = {
    current: null,
  }
  function Harness() {
    valueHolder.current = useStoreBilling(options)
    return null
  }
  TestRenderer.act(() => {
    mountedViews.push(TestRenderer.create(<Harness />))
  })
  if (!valueHolder.current) throw new Error('useStoreBilling did not render')
  return valueHolder.current
}

function renderUsePlayBillingLive(options?: { preferReferralOffer?: boolean; onPurchased?: () => Promise<void> | void }): { current: ReturnType<typeof useStoreBilling> } {
  const holder: { current: ReturnType<typeof useStoreBilling> | null } = { current: null }
  function Harness() {
    holder.current = useStoreBilling(options)
    return null
  }
  TestRenderer.act(() => {
    mountedViews.push(TestRenderer.create(<Harness />))
  })
  if (!holder.current) throw new Error('useStoreBilling did not render')
  return holder as { current: ReturnType<typeof useStoreBilling> }
}

async function flushAsync() {
  await TestRenderer.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('extractStoreOffers', () => {
  it('maps monthly and yearly base plans to offers', () => {
    const offers = extractStoreOffers([
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          { basePlanIdAndroid: 'yearly', offerTokenAndroid: 'tok_y', displayPrice: 'R$99,90' },
        ],
      },
    ])

    expect(offers).toHaveLength(2)
    expect(offers.find((offer) => offer.interval === 'monthly')).toMatchObject({
      sku: 'orbit_pro',
      offerToken: 'tok_m',
      displayPrice: 'R$14,90',
    })
    expect(offers.find((offer) => offer.interval === 'yearly')?.offerToken).toBe('tok_y')
  })

  it('skips offers without a recognized base plan or token', () => {
    const offers = extractStoreOffers([
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'weekly', offerTokenAndroid: 'tok_w', displayPrice: 'x' },
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: null, displayPrice: 'y' },
        ],
      },
    ])

    expect(offers).toHaveLength(0)
  })

  it('extracts a referral-tagged offer priced from its first pricing phase alongside the base offer', () => {
    const offers = extractStoreOffers([
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          {
            basePlanIdAndroid: 'monthly',
            offerTokenAndroid: 'tok_m_ref',
            offerTagsAndroid: ['referral'],
            displayPrice: 'R$14,90',
            pricingPhasesAndroid: {
              pricingPhaseList: [
                { formattedPrice: 'R$13,41', priceAmountMicros: '13410000', priceCurrencyCode: 'BRL' },
                { formattedPrice: 'R$14,90', priceAmountMicros: '14900000', priceCurrencyCode: 'BRL' },
              ],
            },
          },
        ],
      },
    ])

    expect(offers).toHaveLength(2)
    expect(offers.find((offer) => offer.isReferral)).toMatchObject({
      interval: 'monthly',
      offerToken: 'tok_m_ref',
      displayPrice: 'R$13,41',
      priceAmountMicros: '13410000',
      currency: 'BRL',
    })
    expect(offers.find((offer) => !offer.isReferral)?.offerToken).toBe('tok_m')
  })
})

describe('selectStoreOffer', () => {
  const baseOffer: StoreOffer = {
    interval: 'monthly',
    sku: 'orbit_pro',
    offerToken: 'tok_base',
    displayPrice: 'R$14,90',
    isReferral: false,
    priceAmountMicros: '14900000',
    currency: 'BRL',
  }
  const referralOffer: StoreOffer = {
    ...baseOffer,
    offerToken: 'tok_ref',
    displayPrice: 'R$13,41',
    isReferral: true,
    priceAmountMicros: '13410000',
  }

  it('picks the referral offer when preferred and available', () => {
    expect(selectStoreOffer([baseOffer, referralOffer], 'monthly', true)?.offerToken).toBe('tok_ref')
  })

  it('falls back to the base offer when referral is preferred but absent', () => {
    expect(selectStoreOffer([baseOffer], 'monthly', true)?.offerToken).toBe('tok_base')
  })

  it('ignores the referral offer when not preferred', () => {
    expect(selectStoreOffer([baseOffer, referralOffer], 'monthly', false)?.offerToken).toBe('tok_base')
  })
})

describe('mapPlayErrorKey', () => {
  it('returns null for user cancellation', () => {
    expect(mapPlayErrorKey({ code: ErrorCode.UserCancelled })).toBeNull()
  })

  it('maps known error codes to play error keys', () => {
    expect(mapPlayErrorKey({ code: ErrorCode.AlreadyOwned })).toBe('upgrade.playError.alreadyOwned')
    expect(mapPlayErrorKey({ code: ErrorCode.ServiceError })).toBe('upgrade.playError.serviceUnavailable')
    expect(mapPlayErrorKey({ code: ErrorCode.FeatureNotSupported })).toBe('upgrade.playError.deviceNotSupported')
  })

  it('falls back to the generic unavailable key for unknown errors', () => {
    expect(mapPlayErrorKey({})).toBe('upgrade.playError.unavailable')
  })
})

describe('useStoreBilling', () => {
  afterEach(() => {
    TestRenderer.act(() => mountedViews.splice(0).forEach((view) => view.unmount()))
    vi.useRealTimers()
  })
  beforeEach(() => {
    Platform.OS = 'android'
    setAccountId('user-abc')
    mocks.getPendingTransactionsIOS.mockReset().mockResolvedValue([])
    mocks.getTransactionJwsIOS.mockReset().mockResolvedValue('signed-transaction')
    mocks.syncIOS.mockReset().mockResolvedValue(true)
    mocks.state.iapOptions = null
    mocks.state.subscriptions = []
    mocks.state.connected = true
    mocks.state.authUser = { userId: 'user-abc' }
    mocks.apiClient.mockReset().mockResolvedValue({})
    mocks.finishTransaction.mockReset().mockResolvedValue(undefined)
    mocks.getAvailablePurchases.mockReset().mockResolvedValue([])
    mocks.requestPurchase.mockReset().mockResolvedValue(null)
    mocks.fetchProducts.mockReset().mockResolvedValue(undefined)
    mocks.reconnect.mockReset().mockImplementation(() => {
      mocks.state.setConnected?.(true)
      return Promise.resolve(true)
    })
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined)
    mocks.fetchQuery.mockReset().mockResolvedValue(undefined)
  })

  it('exposes monthly and yearly offers from the fetched product', () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          { basePlanIdAndroid: 'yearly', offerTokenAndroid: 'tok_y', displayPrice: 'R$99,90' },
        ],
      },
    ]

    const result = renderUsePlayBilling()

    expect(result.monthlyOffer?.displayPrice).toBe('R$14,90')
    expect(result.yearlyOffer?.offerToken).toBe('tok_y')
  })

  it('handles a rejected product query and retries without starting a purchase', async () => {
    mocks.fetchProducts.mockRejectedValueOnce(new Error('Failed to query product'))
    const billing = renderUsePlayBillingLive()
    await flushAsync()

    expect(billing.current.isProductsError).toBe(true)
    expect(billing.current.isLoadingProducts).toBe(false)
    expect(billing.current.errorKey).toBeNull()
    expect(mocks.requestPurchase).not.toHaveBeenCalled()

    TestRenderer.act(() => billing.current.retryProducts())
    expect(billing.current.isLoadingProducts).toBe(true)
    await flushAsync()

    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2)
    expect(mocks.fetchProducts).toHaveBeenLastCalledWith({ skus: ['orbit_pro'], type: 'subs' })
    expect(billing.current.isProductsError).toBe(false)
    expect(billing.current.isLoadingProducts).toBe(false)
  })

  it.each(['false', 'rejected', 'pending'] as const)('settles a %s initial connection and reconnects before querying on retry', async (outcome) => {
    vi.useFakeTimers()
    mocks.state.connected = false
    const billing = renderUsePlayBillingLive()
    await TestRenderer.act(async () => { await Promise.resolve() })
    expect(billing.current.isLoadingProducts).toBe(true)
    if (outcome === 'rejected') {
      await TestRenderer.act(async () => {
        mocks.state.iapOptions?.onError?.(new Error('Play initialization failed'))
        await Promise.resolve()
      })
    } else {
      await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(10_000))
    }

    expect(billing.current.isProductsError).toBe(true)
    expect(billing.current.isLoadingProducts).toBe(false)
    expect(billing.current.errorKey).toBeNull()
    expect(mocks.fetchProducts).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { billing.current.retryProducts(); await Promise.resolve() })

    expect(mocks.reconnect).toHaveBeenCalledOnce()
    expect(mocks.fetchProducts).toHaveBeenCalledExactlyOnceWith({ skus: ['orbit_pro'], type: 'subs' })
    expect(billing.current.isProductsError).toBe(false)
    expect(billing.current.isLoadingProducts).toBe(false)
    expect(mocks.requestPurchase).not.toHaveBeenCalled()
    await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(billing.current.isProductsError).toBe(false)
  })

  it.each(['false', 'rejected', 'pending'] as const)('settles a %s reconnect without querying and permits another retry', async (outcome) => {
    vi.useFakeTimers()
    mocks.state.connected = false
    const billing = renderUsePlayBillingLive()
    await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(10_000))
    if (outcome === 'false') mocks.reconnect.mockResolvedValueOnce(false)
    else if (outcome === 'rejected') mocks.reconnect.mockRejectedValueOnce(new Error('Play unavailable'))
    else mocks.reconnect.mockImplementationOnce(() => new Promise<boolean>(() => {}))
    await TestRenderer.act(async () => { billing.current.retryProducts(); await Promise.resolve() })
    await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(10_000))

    expect(billing.current.isLoadingProducts).toBe(false)
    expect(billing.current.isProductsError).toBe(true)
    expect(mocks.fetchProducts).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { billing.current.retryProducts(); await Promise.resolve() })
    expect(mocks.reconnect).toHaveBeenCalledTimes(2)
    expect(mocks.fetchProducts).toHaveBeenCalledOnce()
    expect(billing.current.isProductsError).toBe(false)
    expect(billing.current.isLoadingProducts).toBe(false)
  })

  it('clears the connection deadline after connecting and on unmount', async () => {
    vi.useFakeTimers()
    mocks.state.connected = false
    const billing = renderUsePlayBillingLive()
    await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(9_999))
    expect(billing.current.isLoadingProducts).toBe(true)
    await TestRenderer.act(async () => { mocks.state.setConnected?.(true); await Promise.resolve() })
    expect(billing.current.isLoadingProducts).toBe(false)
    await TestRenderer.act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(billing.current.isProductsError).toBe(false)
    TestRenderer.act(() => mountedViews.splice(0).forEach((view) => view.unmount()))
    expect(vi.getTimerCount()).toBe(0)
    renderUsePlayBillingLive()
    TestRenderer.act(() => mountedViews.splice(0).forEach((view) => view.unmount()))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('binds the purchase to the user via obfuscatedAccountId', async () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
        ],
      },
    ]
    const result = renderUsePlayBilling()

    await TestRenderer.act(async () => {
      await result.purchase('monthly')
    })

    expect(mocks.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subs',
        request: {
          google: expect.objectContaining({
            skus: ['orbit_pro'],
            subscriptionOffers: [{ sku: 'orbit_pro', offerToken: 'tok_m' }],
            obfuscatedAccountId: 'user-abc',
          }),
        },
      }),
    )
  })

  it('purchases the referral offer and reports referral pricing when preferred', async () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          {
            basePlanIdAndroid: 'monthly',
            offerTokenAndroid: 'tok_m_ref',
            offerTagsAndroid: ['referral'],
            displayPrice: 'R$14,90',
            pricingPhasesAndroid: {
              pricingPhaseList: [
                { formattedPrice: 'R$13,41', priceAmountMicros: '13410000', priceCurrencyCode: 'BRL' },
              ],
            },
          },
        ],
      },
    ]
    const result = renderUsePlayBilling({ preferReferralOffer: true })

    expect(result.isReferralPricing).toBe(true)
    expect(result.monthlyOffer?.displayPrice).toBe('R$13,41')

    await TestRenderer.act(async () => {
      await result.purchase('monthly')
    })

    expect(mocks.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          google: expect.objectContaining({
            subscriptionOffers: [{ sku: 'orbit_pro', offerToken: 'tok_m_ref' }],
          }),
        },
      }),
    )
  })

  it('keeps the base offer and reports no referral pricing when not preferred', () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          {
            basePlanIdAndroid: 'monthly',
            offerTokenAndroid: 'tok_m_ref',
            offerTagsAndroid: ['referral'],
            displayPrice: 'R$14,90',
            pricingPhasesAndroid: {
              pricingPhaseList: [
                { formattedPrice: 'R$13,41', priceAmountMicros: '13410000', priceCurrencyCode: 'BRL' },
              ],
            },
          },
        ],
      },
    ]

    const result = renderUsePlayBilling()

    expect(result.isReferralPricing).toBe(false)
    expect(result.monthlyOffer?.offerToken).toBe('tok_m')
    expect(result.monthlyOffer?.displayPrice).toBe('R$14,90')
  })

  it('blocks the purchase and flags sign-in when the user id is missing', async () => {
    mocks.state.authUser = null
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
        ],
      },
    ]
    const hook = renderUsePlayBillingLive()

    await TestRenderer.act(async () => {
      await hook.current.purchase('monthly')
    })

    expect(mocks.requestPurchase).not.toHaveBeenCalled()
    expect(hook.current.errorKey).toBe('upgrade.playError.notSignedIn')
  })

  it('opens one purchase sheet across rapid interval switches and waits for verification', async () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
          { basePlanIdAndroid: 'yearly', offerTokenAndroid: 'tok_y', displayPrice: 'R$99,90' },
        ],
      },
    ]
    const hook = renderUsePlayBillingLive()
    expect(hook.current.isProcessing).toBe(false)

    await TestRenderer.act(async () => {
      await hook.current.purchase('monthly')
      await hook.current.purchase('yearly')
    })

    expect(hook.current.isProcessing).toBe(true)

    expect(mocks.requestPurchase).toHaveBeenCalledOnce()
    let release!: () => void
    mocks.apiClient.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}) }))
    const firstPurchase = createPlayPurchase({ purchaseToken: 'tok_a' })
    await TestRenderer.act(async () => {
      mocks.state.iapOptions?.onPurchaseSuccess?.(firstPurchase)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(hook.current.isProcessing).toBe(true)

    await TestRenderer.act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(hook.current.isProcessing).toBe(false)
  })

  it('clears the spinner when the purchase sheet reports an error', async () => {
    mocks.state.subscriptions = [
      {
        id: 'orbit_pro',
        subscriptionOffers: [
          { basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: 'R$14,90' },
        ],
      },
    ]
    const hook = renderUsePlayBillingLive()

    await TestRenderer.act(async () => {
      await hook.current.purchase('monthly')
    })
    expect(hook.current.isProcessing).toBe(true)

    await TestRenderer.act(() => {
      mocks.state.iapOptions?.onPurchaseError?.({ code: ErrorCode.ServiceError })
    })

    expect(hook.current.isProcessing).toBe(false)
    expect(hook.current.errorKey).toBe('upgrade.playError.serviceUnavailable')
  })

  it('verifies, invalidates entitlement, and finishes a successful purchase', async () => {
    renderUsePlayBilling()
    const purchase = createPlayPurchase({ purchaseToken: 'tok_123' })

    mocks.state.iapOptions?.onPurchaseSuccess?.(purchase)
    await flushAsync()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.subscription.playVerify,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ productId: 'orbit_pro', purchaseToken: 'tok_123' }),
      }),
    )
    expect(mocks.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false })
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('restores an owned purchase: verifies, finishes, and invalidates entitlement', async () => {
    const purchase = createPlayPurchase({ purchaseToken: 'tok_restore' })
    mocks.getAvailablePurchases.mockResolvedValue([purchase])
    const result = renderUsePlayBilling()

    let restored: boolean | undefined
    await TestRenderer.act(async () => {
      restored = await result.restorePurchases()
    })

    expect(restored).toBe(true)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.subscription.playVerify,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ productId: 'orbit_pro', purchaseToken: 'tok_restore' }),
      }),
    )
    expect(mocks.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false })
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('settles restored entitlement before notifying the onboarding host', async () => {
    mocks.getAvailablePurchases.mockResolvedValue([createPlayPurchase({ purchaseToken: 'tok_restore' })])
    const onPurchased = vi.fn()
    const result = renderUsePlayBilling({ onPurchased })
    await TestRenderer.act(async () => { await result.restorePurchases() })
    expect(onPurchased).toHaveBeenCalledOnce()
    expect(mocks.invalidateQueries.mock.invocationCallOrder.at(-1)).toBeLessThan(onPurchased.mock.invocationCallOrder[0]!)
  })

  it('notifies the purchase host only after profile refresh succeeds', async () => {
    let release!: () => void
    mocks.fetchQuery.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const onPurchased = vi.fn()
    renderUsePlayBilling({ onPurchased })
    mocks.state.iapOptions?.onPurchaseSuccess?.(createPlayPurchase({ purchaseToken: 'tok_success' }))
    await flushAsync()
    expect(onPurchased).not.toHaveBeenCalled()
    release()
    await flushAsync()
    expect(onPurchased).toHaveBeenCalledOnce()
    expect(mocks.invalidateQueries).toHaveBeenLastCalledWith(expect.anything(), { throwOnError: true })
  })

  it('keeps a cancelled purchase open without an error or completion callback', async () => {
    mocks.state.subscriptions = [{ id: 'orbit_pro', subscriptionOffers: [{ basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: '$9.99' }] }]
    const onPurchased = vi.fn()
    const hook = renderUsePlayBillingLive({ onPurchased })
    await TestRenderer.act(async () => { await hook.current.purchase('monthly') })
    await TestRenderer.act(() => { mocks.state.iapOptions?.onPurchaseError?.({ code: ErrorCode.UserCancelled }) })
    expect(hook.current.isProcessing).toBe(false)
    expect(hook.current.errorKey).toBeNull()
    expect(onPurchased).not.toHaveBeenCalled()
  })

  it.each(['rejection', 'listener'] as const)('keeps the service error when an unprepared Play client reports through %s', async (delivery) => {
    mocks.state.subscriptions = [{ id: 'orbit_pro', subscriptionOffers: [{ basePlanIdAndroid: 'monthly', offerTokenAndroid: 'tok_m', displayPrice: '$9.99' }] }]
    const error = { code: ErrorCode.NotPrepared, message: 'Billing client is not prepared' }
    if (delivery === 'rejection') mocks.requestPurchase.mockRejectedValueOnce(error)
    const onPurchased = vi.fn()
    const hook = renderUsePlayBillingLive({ onPurchased })
    await TestRenderer.act(async () => {
      expect(await hook.current.purchase('monthly')).toBe(delivery === 'listener')
    })
    if (delivery === 'listener') {
      await TestRenderer.act(() => { mocks.state.iapOptions?.onPurchaseError?.(error) })
    }
    expect(hook.current.isProcessing).toBe(false)
    expect(hook.current.errorKey).toBe('upgrade.playError.serviceUnavailable')
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.finishTransaction).not.toHaveBeenCalled()
    expect(onPurchased).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { expect(await hook.current.purchase('monthly')).toBe(true) })
    expect(mocks.requestPurchase).toHaveBeenCalledTimes(2)
  })

  it('drops old account purchase settlement after verification', async () => {
    let release!: () => void
    mocks.apiClient.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const onPurchased = vi.fn()
    renderUsePlayBilling({ onPurchased })
    mocks.state.iapOptions?.onPurchaseSuccess?.(createPlayPurchase({ purchaseToken: 'tok_old' }))
    advanceAccountGeneration()
    release()
    await flushAsync()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
    expect(onPurchased).not.toHaveBeenCalled()
  })

  it('sets the service-unavailable error and skips verify when restore fails', async () => {
    mocks.getAvailablePurchases.mockRejectedValue(new Error('network'))
    const hook = renderUsePlayBillingLive()

    let restored: boolean | undefined
    await TestRenderer.act(async () => {
      restored = await hook.current.restorePurchases()
    })

    expect(restored).toBe(false)
    expect(hook.current.errorKey).toBe('upgrade.playError.serviceUnavailable')
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('restores the remaining owned purchases even when one verify fails', async () => {
    const bad = createPlayPurchase({ purchaseToken: 'tok_bad' })
    const good = createPlayPurchase({ purchaseToken: 'tok_good' })
    mocks.getAvailablePurchases.mockResolvedValue([bad, good])
    mocks.apiClient.mockImplementation((_endpoint: string, options: { body: string }) => {
      const body = JSON.parse(options.body) as { purchaseToken: string }
      if (body.purchaseToken === 'tok_bad') return Promise.reject(new Error('verify failed'))
      return Promise.resolve({})
    })
    const result = renderUsePlayBilling()

    let restored: boolean | undefined
    await TestRenderer.act(async () => {
      restored = await result.restorePurchases()
    })

    expect(restored).toBe(true)
    expect(mocks.finishTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.finishTransaction).toHaveBeenCalledWith({ purchase: good, isConsumable: false })
    expect(mocks.invalidateQueries).toHaveBeenCalledOnce()
  })

  it('flags nothing-to-restore when the account owns no purchases', async () => {
    mocks.getAvailablePurchases.mockResolvedValue([])
    const hook = renderUsePlayBillingLive()

    let restored: boolean | undefined
    await TestRenderer.act(async () => {
      restored = await hook.current.restorePurchases()
    })

    expect(restored).toBe(false)
    expect(hook.current.errorKey).toBe('upgrade.playError.nothingToRestore')
    expect(mocks.finishTransaction).not.toHaveBeenCalled()
  })

  it('uses an account-bound App Store request, native prices and no referral offer', async () => {
    Platform.OS = 'ios'
    mocks.state.authUser = { userId: '11111111-1111-4111-8111-111111111111' }
    setAccountId(mocks.state.authUser.userId)
    mocks.state.subscriptions = [
      { id: 'orbit.monthly', displayPrice: '$4.99', price: 4.99, currency: 'USD' },
      { id: 'orbit.yearly', displayPrice: '$39.99', price: 39.99, currency: 'USD' },
    ]
    const hook = renderUsePlayBillingLive({ preferReferralOffer: true })
    await flushAsync()
    expect(hook.current.monthlyOffer).toMatchObject({ displayPrice: '$4.99', isReferral: false })
    await TestRenderer.act(async () => { await hook.current.purchase('yearly'); await hook.current.purchase('yearly') })
    expect(mocks.requestPurchase).toHaveBeenCalledExactlyOnceWith({ type: 'subs', request: { apple: { sku: 'orbit.yearly', appAccountToken: '11111111-1111-4111-8111-111111111111' } } })
    expect(mocks.fetchProducts).toHaveBeenCalledWith({ skus: ['orbit.monthly', 'orbit.yearly'], type: 'subs' })
  })

  it('leaves failed Apple verification unfinished and retries at the next connection', async () => {
    Platform.OS = 'ios'
    const purchase = createApplePurchase({ id: 'monthly-transaction', transactionId: 'monthly-transaction' })
    mocks.getPendingTransactionsIOS.mockResolvedValue([purchase])
    mocks.apiClient.mockRejectedValueOnce(new Error('network'))
    const first = renderUsePlayBillingLive()
    await flushAsync()
    expect(first.current.errorKey).toBe('upgrade.appStore.error.serviceUnavailable')
    expect(mocks.finishTransaction).not.toHaveBeenCalled()
    TestRenderer.act(() => mountedViews.splice(0).forEach((view) => view.unmount()))
    renderUsePlayBillingLive()
    await flushAsync()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.subscription.appStoreVerify, expect.objectContaining({ body: JSON.stringify({ signedTransaction: 'signed-transaction' }) }))
    expect(mocks.finishTransaction).toHaveBeenCalledExactlyOnceWith({ purchase, isConsumable: false })
  })

  it.each(['recovery', 'restore'] as const)('exposes the %s lock and accepts checkout after an empty result', async (operation) => {
    Platform.OS = 'ios'
    mocks.state.subscriptions = [{ id: 'orbit.monthly', displayPrice: '$4.99', price: 4.99, currency: 'USD' }]
    let release!: (purchases: []) => void
    const pending = new Promise<[]>((resolve) => { release = resolve })
    if (operation === 'recovery') mocks.getPendingTransactionsIOS.mockReturnValueOnce(pending)
    else mocks.getAvailablePurchases.mockReturnValueOnce(pending)
    const hook = renderUsePlayBillingLive()
    await flushAsync()
    let restoration: Promise<boolean> | undefined
    if (operation === 'restore') await TestRenderer.act(async () => { restoration = hook.current.restorePurchases(); await Promise.resolve() })
    expect(hook.current.isRestoring).toBe(true)
    await TestRenderer.act(async () => { expect(await hook.current.purchase('monthly')).toBe(false) })
    expect(mocks.requestPurchase).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { release([]); await restoration })
    await flushAsync()
    expect(hook.current.isRestoring).toBe(false)
    await TestRenderer.act(async () => { expect(await hook.current.purchase('monthly')).toBe(true) })
    expect(mocks.requestPurchase).toHaveBeenCalledOnce()
  })

  it('restores Apple subscriptions only after sync and verification', async () => {
    Platform.OS = 'ios'
    const purchase = createApplePurchase({ id: 'yearly-transaction', transactionId: 'yearly-transaction', productId: 'orbit.yearly' })
    mocks.getAvailablePurchases.mockResolvedValue([purchase])
    const hook = renderUsePlayBillingLive()
    await flushAsync()
    await TestRenderer.act(async () => { expect(await hook.current.restorePurchases()).toBe(true) })
    expect(mocks.syncIOS).toHaveBeenCalledOnce()
    expect(mocks.getTransactionJwsIOS).toHaveBeenCalledWith('orbit.yearly')
    expect(mocks.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false })
    expect(mocks.apiClient.mock.invocationCallOrder[0]).toBeLessThan(mocks.finishTransaction.mock.invocationCallOrder[0]!)
  })

  it.each([[ErrorCode.UserCancelled, null], [ErrorCode.Pending, 'upgrade.appStore.error.pending'], [ErrorCode.DeferredPayment, 'upgrade.appStore.error.pending']] as const)('handles Apple sheet outcome %s', (code, expected) => {
    Platform.OS = 'ios'
    const hook = renderUsePlayBillingLive()
    TestRenderer.act(() => { mocks.state.iapOptions?.onPurchaseError?.({ code }) })
    expect(hook.current.errorKey).toBe(expected)
    expect(hook.current.isProcessing).toBe(false)
    expect(mocks.finishTransaction).not.toHaveBeenCalled()
  })

})
