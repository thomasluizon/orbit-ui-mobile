import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'

const { showSuccess, translate } = vi.hoisted(() => ({ showSuccess: vi.fn(), translate: (key: string) => key }))
vi.mock('next-intl', () => ({ useTranslations: () => translate }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess }) }))
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); holdAccount('account-1'); history.replaceState({}, '', '/upgrade?subscription=success&keep=1') })
function mount(mockInvalidation = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  if (mockInvalidation) invalidate.mockResolvedValue()
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, invalidate, wrapper }
}
describe('Stripe return', () => {
  it('consumes the return only after entitlement refresh and shows the done toast once', async () => {
    const { invalidate, wrapper } = mount()
    const view = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('upgrade.purchaseSuccess'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.all }, { throwOnError: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.all }, { throwOnError: true })
    expect(location.search).toBe('?keep=1')
    view.unmount(); renderHook(() => useStripeCheckoutReturn(), { wrapper })
    expect(showSuccess).toHaveBeenCalledOnce()
  })
  it('does not toast a checkout from an account replaced during refresh', async () => {
    const { invalidate, wrapper } = mount()
    let release!: () => void
    invalidate.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))
    renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await act(async () => { await replaceAccountWith('account-2'); release() })
    expect(showSuccess).not.toHaveBeenCalled()
  })
  it('retains a failed return for recovery and toasts only after a successful active profile refresh', async () => {
    const { client, wrapper } = mount(false)
    const free = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false })
    const pro = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false })
    const fetchProfile = vi.fn().mockRejectedValue(new Error('Profile refresh failed'))
    function useReturnWithProfile() {
      const profile = useQuery({ queryKey: profileKeys.detail(), queryFn: fetchProfile, initialData: free, staleTime: Infinity })
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
