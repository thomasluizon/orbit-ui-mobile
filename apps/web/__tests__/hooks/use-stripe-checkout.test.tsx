import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { useStripeCheckout } from '@/hooks/use-stripe-checkout'

const mocks = vi.hoisted(() => ({ request: vi.fn(), online: true }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/throttle-fetch', () => ({ fetchWithThrottle: (...args: unknown[]) => mocks.request(...args) }))
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); holdAccount('account-1'); mocks.online = true
  mocks.request.mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.example/session' }), { status: 200 }))
})
describe('Shared Stripe checkout', () => {
  it('awaits onboarding completion before redirecting to the verified checkout url', async () => {
    const assigned: string[] = []
    vi.stubGlobal('location', { set href(value: string) { assigned.push(value) } })
    let release!: () => void
    const completion = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const { result } = renderHook(() => useStripeCheckout(completion))
    let checkout!: Promise<void>
    await act(async () => { checkout = result.current.checkout('yearly'); await Promise.resolve() })
    expect(completion).toHaveBeenCalledOnce(); expect(assigned).toEqual([])
    await act(async () => { release(); await checkout })
    expect(assigned).toEqual(['https://checkout.example/session'])
    expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining(API.subscription.checkout), expect.objectContaining({ headers: expect.objectContaining({ 'X-Orbit-Held-Account-Id': 'account-1' }) }))
  })
  it('drops a checkout after account replacement during completion', async () => {
    const assigned: string[] = []
    vi.stubGlobal('location', { set href(value: string) { assigned.push(value) } })
    const completion = vi.fn(() => replaceAccountWith('account-2'))
    const { result } = renderHook(() => useStripeCheckout(completion))
    await act(async () => result.current.checkout('monthly'))
    expect(assigned).toEqual([])
  })
  it('does not redirect when onboarding completion fails', async () => {
    const assigned: string[] = []
    vi.stubGlobal('location', { set href(value: string) { assigned.push(value) } })
    const { result } = renderHook(() => useStripeCheckout(vi.fn(async () => { throw new Error('completion failed') })))
    await act(async () => result.current.checkout('yearly'))
    expect(assigned).toEqual([]); expect(result.current.checkoutError).not.toBe('')
  })
})
