import React from 'react'
import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { usePlayBilling } from '@/hooks/use-play-billing'
import { setAccountId } from '@/lib/account-scope'

const TestRenderer = require('react-test-renderer')
const { act } = TestRenderer

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  finishTransaction: vi.fn(),
  getAvailablePurchases: vi.fn(),
  fetchProducts: vi.fn(),
  requestPurchase: vi.fn(),
  onPurchaseSuccess: null as ((purchase: unknown) => void) | null,
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { userId: string } }) => unknown) => selector({ user: { userId: 'account-1' } }),
}))
vi.mock('expo-iap', async (importOriginal) => ({
  ...await importOriginal<typeof import('expo-iap')>(),
  finishTransaction: mocks.finishTransaction,
  getAvailablePurchases: mocks.getAvailablePurchases,
  useIAP: (options: { onPurchaseSuccess: (purchase: unknown) => void }) => {
    mocks.onPurchaseSuccess = options.onPurchaseSuccess
    return { connected: true, subscriptions: [], fetchProducts: mocks.fetchProducts, requestPurchase: mocks.requestPurchase }
  },
}))

let view: { unmount: () => void } | undefined
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  setAccountId('account-1')
  onlineManager.setOnline(true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.finishTransaction.mockResolvedValue(undefined)
  mocks.fetchProducts.mockResolvedValue(undefined)
})
afterEach(() => {
  act(() => view?.unmount())
  client.clear()
  onlineManager.setOnline(true)
})

async function flushAsync() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

describe('Play entitlement settlement', () => {
  it.each(['purchase', 'restore'] as const)('keeps %s pending while offline and notifies only after the resumed profile read succeeds', async (operation) => {
    const free = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false })
    const pro = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false })
    const purchase = { productId: 'orbit_pro', purchaseToken: 'owned-token' }
    let release!: () => void
    const fetchProfile = vi.fn(() => new Promise<typeof pro>((resolve) => { release = () => resolve(pro) }))
    mocks.apiClient.mockImplementation((endpoint: string) => endpoint === API.profile.get ? fetchProfile() : Promise.resolve({}))
    mocks.getAvailablePurchases.mockResolvedValue([purchase])
    const onPurchased = vi.fn()
    const holder: { current: ReturnType<typeof usePlayBilling> | null } = { current: null }
    function Harness() {
      useQuery({ queryKey: profileKeys.detail(), queryFn: () => mocks.apiClient(API.profile.get), initialData: free, staleTime: Infinity })
      holder.current = usePlayBilling({ onPurchased })
      return null
    }
    act(() => { view = TestRenderer.create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
    onlineManager.setOnline(false)
    let restored: boolean | undefined
    act(() => {
      if (operation === 'purchase') mocks.onPurchaseSuccess?.(purchase)
      else void holder.current!.restorePurchases().then((result) => { restored = result })
    })
    await flushAsync()
    expect(client.getQueryState(profileKeys.detail())?.fetchStatus).toBe('paused')
    expect(fetchProfile).not.toHaveBeenCalled()
    expect(client.getQueryData(profileKeys.detail())).toEqual(free)
    expect(onPurchased).not.toHaveBeenCalled()
    if (operation === 'restore') {
      expect(restored).toBeUndefined()
      expect(holder.current!.isRestoring).toBe(true)
    }
    act(() => { onlineManager.setOnline(true) })
    await flushAsync()
    expect(fetchProfile).toHaveBeenCalledOnce()
    expect(onPurchased).not.toHaveBeenCalled()
    act(() => { release() })
    await flushAsync()
    expect(client.getQueryData(profileKeys.detail())).toEqual(pro)
    expect(onPurchased).toHaveBeenCalledOnce()
    expect(holder.current!.errorKey).toBeNull()
    if (operation === 'restore') expect(restored).toBe(true)
  })
})
