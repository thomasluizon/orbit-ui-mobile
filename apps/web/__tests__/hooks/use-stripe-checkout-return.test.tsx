import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'

const showSuccess = vi.hoisted(() => vi.fn())
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess }) }))
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); holdAccount('account-1'); history.replaceState({}, '', '/upgrade?subscription=success&keep=1') })
function mount() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, invalidate, wrapper }
}
describe('Stripe return', () => {
  it('refreshes entitlement and consumes the success parameter before showing the done toast once', async () => {
    const { invalidate, wrapper } = mount()
    const view = renderHook(() => useStripeCheckoutReturn(), { wrapper })
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('upgrade.purchaseSuccess'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.all })
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
})
