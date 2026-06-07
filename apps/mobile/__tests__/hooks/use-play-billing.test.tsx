import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { ErrorCode } from 'expo-iap'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    iapOptions: null as {
      onPurchaseSuccess?: (purchase: unknown) => void
      onPurchaseError?: (error: unknown) => void
    } | null,
    subscriptions: [] as unknown[],
    connected: true,
    authUser: { userId: 'user-abc' } as { userId: string } | null,
  }
  return {
    state,
    apiClient: vi.fn(),
    finishTransaction: vi.fn(),
    getAvailablePurchases: vi.fn(),
    requestPurchase: vi.fn(),
    fetchProducts: vi.fn(),
    invalidateQueries: vi.fn(),
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
  },
  finishTransaction: mocks.finishTransaction,
  getAvailablePurchases: mocks.getAvailablePurchases,
  useIAP: (options: typeof mocks.state.iapOptions) => {
    mocks.state.iapOptions = options
    return {
      connected: mocks.state.connected,
      subscriptions: mocks.state.subscriptions,
      fetchProducts: mocks.fetchProducts,
      requestPurchase: mocks.requestPurchase,
    }
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { userId: string } | null }) => unknown) =>
    selector({ user: mocks.state.authUser }),
}))

import { extractPlayOffers, mapPlayErrorKey, usePlayBilling } from '@/hooks/use-play-billing'

function renderUsePlayBilling(): ReturnType<typeof usePlayBilling> {
  let value: ReturnType<typeof usePlayBilling> | null = null
  function Harness() {
    value = usePlayBilling()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  if (!value) throw new Error('usePlayBilling did not render')
  return value
}

function renderUsePlayBillingLive(): { current: ReturnType<typeof usePlayBilling> } {
  const holder: { current: ReturnType<typeof usePlayBilling> | null } = { current: null }
  function Harness() {
    holder.current = usePlayBilling()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  if (!holder.current) throw new Error('usePlayBilling did not render')
  return holder as { current: ReturnType<typeof usePlayBilling> }
}

async function flushAsync() {
  await TestRenderer.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('extractPlayOffers', () => {
  it('maps monthly and yearly base plans to offers', () => {
    const offers = extractPlayOffers([
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
    const offers = extractPlayOffers([
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

describe('usePlayBilling', () => {
  beforeEach(() => {
    mocks.state.iapOptions = null
    mocks.state.subscriptions = []
    mocks.state.connected = true
    mocks.state.authUser = { userId: 'user-abc' }
    mocks.apiClient.mockReset().mockResolvedValue({})
    mocks.finishTransaction.mockReset().mockResolvedValue(undefined)
    mocks.getAvailablePurchases.mockReset().mockResolvedValue([])
    mocks.requestPurchase.mockReset().mockResolvedValue(null)
    mocks.fetchProducts.mockReset().mockResolvedValue(undefined)
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined)
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

  it('verifies, invalidates entitlement, and finishes a successful purchase', async () => {
    renderUsePlayBilling()
    const purchase = { productId: 'orbit_pro', purchaseToken: 'tok_123' }

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
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)
  })

  it('restores an owned purchase: verifies, finishes, and invalidates entitlement', async () => {
    const purchase = { productId: 'orbit_pro', purchaseToken: 'tok_restore' }
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
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)
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
    const bad = { productId: 'orbit_pro', purchaseToken: 'tok_bad' }
    const good = { productId: 'orbit_pro', purchaseToken: 'tok_good' }
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
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)
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
})
