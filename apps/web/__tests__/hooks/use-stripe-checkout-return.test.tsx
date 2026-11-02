import React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'
import { fetchJson } from '@/lib/api-fetch'

const { showSuccess, translate } = vi.hoisted(() => ({ showSuccess: vi.fn(), translate: (key: string) => key }))
vi.mock('next-intl', () => ({ useTranslations: () => translate }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess }) }))
vi.mock('@/lib/api-fetch', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api-fetch')>(), fetchJson: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); holdAccount('account-1'); history.replaceState({}, '', '/upgrade?subscription=success&keep=1') })
afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.useRealTimers() })
function mount(mockInvalidation = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const fetch = vi.spyOn(client, 'fetchQuery')
  if (mockInvalidation) {
    invalidate.mockResolvedValue()
    fetch.mockResolvedValue(createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false }))
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, invalidate, fetch, wrapper }
}
describe('Stripe return', () => {
  it.each(['/upgrade', '/profile/astra'])('preserves an offline return on %s until the resumed entitlement read succeeds, then settles once', async (route) => {
    history.replaceState({}, '', `${route}?subscription=success&keep=1`)
    const { client, wrapper } = mount(false)
    const free = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false })
    const pro = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false })
    let release!: () => void
    const fetchProfile = vi.mocked(fetchJson).mockImplementation(() => new Promise<typeof pro>((resolve) => { release = () => resolve(pro) }))
    onlineManager.setOnline(false)
    const view = renderHook(() => {
      const profile = useQuery({ queryKey: profileKeys.detail(), queryFn: () => fetchJson<Profile>(API.profile.get), initialData: free, staleTime: Infinity })
      return { ...profile, ...useStripeCheckoutReturn() }
    }, { wrapper })
    await waitFor(() => expect(view.result.current.fetchStatus).toBe('paused'))
    expect(fetchProfile).not.toHaveBeenCalled()
    expect(client.getQueryData(profileKeys.detail())).toEqual(free)
    expect(location.search).toBe('?subscription=success&keep=1')
    expect(showSuccess).not.toHaveBeenCalled()
    expect(view.result.current.isSettling).toBe(true)
    await act(async () => { onlineManager.setOnline(true) })
    await waitFor(() => expect(fetchProfile).toHaveBeenCalledOnce())
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
    await act(async () => { release() })
    await waitFor(() => expect(showSuccess).toHaveBeenCalledOnce())
    expect(client.getQueryData(profileKeys.detail())).toEqual(pro)
    expect(location.search).toBe('?keep=1')
    view.unmount()
    renderHook(() => useStripeCheckoutReturn(), { wrapper })
    expect(showSuccess).toHaveBeenCalledOnce()
  })
  it('consumes the return only after entitlement refresh and shows the done toast once', async () => {
    const { invalidate, wrapper } = mount()
    const view = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('upgrade.purchaseSuccess'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.all }, { throwOnError: true })
    expect(location.search).toBe('?keep=1')
    view.unmount(); renderHook(() => useStripeCheckoutReturn(), { wrapper })
    expect(showSuccess).toHaveBeenCalledOnce()
  })
  it('does not toast a checkout from an account replaced during refresh', async () => {
    const { fetch, wrapper } = mount()
    let release!: () => void
    fetch.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))
    renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await act(async () => { await replaceAccountWith('account-2'); release() })
    expect(showSuccess).not.toHaveBeenCalled()
  })
  it('retains a failed return for recovery and toasts only after a failed profile refresh is retried with Pro access', async () => {
    const { client, wrapper } = mount(false)
    const free = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false })
    const pro = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false })
    const fetchProfile = vi.mocked(fetchJson).mockRejectedValue(new Error('Profile refresh failed'))
    function useReturnWithProfile() {
      const profile = useQuery({ queryKey: profileKeys.detail(), queryFn: () => fetchJson<Profile>(API.profile.get), initialData: free, staleTime: Infinity })
      const settlement = useStripeCheckoutReturn()
      return { ...profile, ...settlement }
    }
    const view = renderHook(useReturnWithProfile, { wrapper })
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(client.getQueryData(profileKeys.detail())).toEqual(free)
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
    await waitFor(() => expect(view.result.current.hasReturnError).toBe(true))
    view.unmount()
    fetchProfile.mockResolvedValue(pro)
    const recovery = renderHook(useReturnWithProfile, { wrapper })
    await waitFor(() => expect(showSuccess).toHaveBeenCalledOnce())
    expect(client.getQueryData(profileKeys.detail())).toEqual(pro)
    expect(location.search).toBe('?keep=1')
    recovery.unmount()
    renderHook(useReturnWithProfile, { wrapper })
    expect(showSuccess).toHaveBeenCalledOnce()
  })

})

describe('Stripe webhook settlement window', () => {
  const free = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false })
  const pro = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false })
  beforeEach(() => { vi.useFakeTimers() })

  async function advanceSettlement(milliseconds = 0) {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
  }

  it('toasts once when Pro is confirmed on the first read without scheduling another read', async () => {
    const { fetch, invalidate, wrapper } = mount()
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    expect(showSuccess).toHaveBeenCalledExactlyOnceWith('upgrade.purchaseSuccess')
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: false })
    expect(location.search).toBe('?keep=1')
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(showSuccess).toHaveBeenCalledOnce()
  })

  it('keeps settling without an error until Pro arrives on the third read', async () => {
    const { fetch, invalidate, wrapper } = mount()
    fetch.mockResolvedValueOnce(free).mockResolvedValueOnce(free).mockResolvedValueOnce(pro)
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: true })
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
    await advanceSettlement(999)
    expect(fetch).toHaveBeenCalledOnce()
    await advanceSettlement(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: true })
    await advanceSettlement(1999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await advanceSettlement(1)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: false })
    expect(showSuccess).toHaveBeenCalledExactlyOnceWith('upgrade.purchaseSuccess')
    expect(location.search).toBe('?keep=1')
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(showSuccess).toHaveBeenCalledOnce()
  })

  it('keeps the query and shows Retry only after all four backoffs expire without Pro', async () => {
    const { fetch, invalidate, wrapper } = mount()
    fetch.mockResolvedValue(free)
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    for (const [index, delay] of [1000, 2000, 4000, 8000].entries()) {
      expect(result.current).toMatchObject({ hasReturnError: false, isSettling: true })
      await advanceSettlement(delay - 1)
      expect(fetch).toHaveBeenCalledTimes(index + 1)
      await advanceSettlement(1)
      expect(fetch).toHaveBeenCalledTimes(index + 2)
    }
    expect(invalidate).toHaveBeenCalledTimes(5)
    expect(result.current).toMatchObject({ hasReturnError: true, isSettling: false })
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('starts a fresh settlement window and clears the error when Retry is pressed', async () => {
    const { fetch, wrapper } = mount()
    fetch.mockResolvedValue(free)
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    await advanceSettlement(15000)
    expect(result.current).toMatchObject({ hasReturnError: true, isSettling: false })
    fetch.mockResolvedValueOnce(free).mockResolvedValueOnce(pro)
    await act(async () => result.current.retryReturn())
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: true })
    expect(location.search).toBe('?subscription=success&keep=1')
    await advanceSettlement(1000)
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: false })
    expect(showSuccess).toHaveBeenCalledOnce()
    expect(location.search).toBe('?keep=1')
  })

  it('stops the settlement window when another account replaces the session', async () => {
    const { fetch, invalidate, wrapper } = mount()
    fetch.mockResolvedValueOnce(free).mockResolvedValue(pro)
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    expect(result.current.isSettling).toBe(true)
    await replaceAccountWith('account-2')
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(showSuccess).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: false })
    expect(location.search).toBe('?subscription=success&keep=1')
    await act(async () => result.current.retryReturn())
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('stops refetching when the return hook unmounts during backoff', async () => {
    const { fetch, invalidate, wrapper } = mount()
    fetch.mockResolvedValue(free)
    const view = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    view.unmount()
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
  })

  it('stops the window and preserves the return when a later profile read fails', async () => {
    const { fetch, wrapper } = mount()
    fetch.mockResolvedValueOnce(free).mockRejectedValueOnce(new Error('Profile refresh failed'))
    const { result } = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await advanceSettlement()
    expect(result.current).toMatchObject({ hasReturnError: false, isSettling: true })
    await advanceSettlement(1000)
    expect(result.current).toMatchObject({ hasReturnError: true, isSettling: false })
    await advanceSettlement(15000)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(showSuccess).not.toHaveBeenCalled()
    expect(location.search).toBe('?subscription=success&keep=1')
  })
})
