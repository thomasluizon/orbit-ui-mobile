import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  goBackOrFallback: vi.fn(),
  openCustomerPortal: vi.fn(),
  refetchBilling: vi.fn(),
  refetchStatus: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => 'en',
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => mocks.goBackOrFallback,
}))

vi.mock('@/lib/actions/subscription', () => ({
  openCustomerPortal: () => mocks.openCustomerPortal(),
}))

let status: Record<string, unknown> | null = null

vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({
    status,
    isLoading: false,
    isError: false,
    refetch: mocks.refetchStatus,
  }),
}))

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({
    plans: {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 6999 },
      currency: 'usd',
      savingsPercent: 41,
      couponPercentOff: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    discountedAmount: (amount: number) => amount,
  }),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({
    billing: { status: 'active', cancelAtPeriodEnd: false },
    isLoading: false,
    isError: false,
    refetch: mocks.refetchBilling,
  }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess }),
}))

import UpgradePage from '@/app/(app)/upgrade/page'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
  respondWithAccount,
} from '@/__tests__/support/account-change'

const LAPSED_STATUS = {
  plan: 'free',
  hasProAccess: false,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: null,
  aiMessagesUsed: 3,
  aiMessagesLimit: 5,
  isLifetimePro: false,
  subscriptionInterval: null,
  source: null,
  lapseReason: 'expired',
  subscriptionEndedAtUtc: '2026-08-01T00:00:00Z',
}

const STRIPE_PRO_STATUS = {
  ...LAPSED_STATUS,
  plan: 'pro',
  hasProAccess: true,
  aiMessagesLimit: 50,
  subscriptionInterval: 'monthly',
  source: 'stripe',
  lapseReason: null,
  subscriptionEndedAtUtc: null,
}

function checkoutButton(): HTMLElement {
  return screen.getAllByRole('button', {
    name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
  })[0]!
}

describe('UpgradePage across an account change', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('fetch', vi.fn())
    status = LAPSED_STATUS
    mocks.openCustomerPortal.mockReset()
    mocks.refetchStatus.mockReset().mockResolvedValue(undefined)
    mocks.refetchBilling.mockReset().mockResolvedValue(undefined)
    mocks.showSuccess.mockReset()
    mocks.goBackOrFallback.mockReset()
    globalThis.sessionStorage.clear()
    holdAccount('user-1')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the next account their own lapse notice rather than the previous pitch', async () => {
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.getByText('upgrade.billing.lapsed.title')).toBeInTheDocument()
  })

  it('keeps the pitch open when the same account recovers from a rejected refresh', async () => {
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))

    await recoverSameAccount('user-1')

    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()
  })

  it('drops the checkout failure when another account replaces the tab', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('card network down'))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    expect(await screen.findByText('auth.genericError')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.queryByText('auth.genericError')).not.toBeInTheDocument()
  })

  it('keeps the checkout failure when the same account recovers from a rejected refresh', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('card network down'))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    expect(await screen.findByText('auth.genericError')).toBeInTheDocument()

    await recoverSameAccount('user-1')

    expect(screen.getByText('auth.genericError')).toBeInTheDocument()
  })

  it('stops the checkout spinner when another account replaces the tab mid request', async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise(() => {}))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    await waitFor(() => expect(checkoutButton()).toHaveAttribute('aria-busy', 'true'))

    await replaceAccountWith('user-2')
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))

    expect(checkoutButton()).not.toHaveAttribute('aria-busy')
  })

  it('never sends the next account to the previous account checkout session', async () => {
    let settleCheckout!: (response: Response) => void
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      () => new Promise((resolve) => { settleCheckout = resolve }),
    )
    vi.stubGlobal('location', { href: '' })
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    await waitFor(() => expect(checkoutButton()).toHaveAttribute('aria-busy', 'true'))

    await replaceAccountWith('user-2')
    await act(async () => {
      settleCheckout({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: 'https://checkout.stripe.test/user-1' }),
      } as unknown as Response)
      await Promise.resolve()
    })

    expect(globalThis.location.href).toBe('')
  })

  it('never shows the next account a failure from the previous account checkout', async () => {
    let failCheckout!: (reason: Error) => void
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { failCheckout = reject }),
    )
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    await waitFor(() => expect(checkoutButton()).toHaveAttribute('aria-busy', 'true'))

    await replaceAccountWith('user-2')
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    await act(async () => {
      failCheckout(new Error('card network down'))
      await Promise.resolve()
    })

    expect(screen.queryByText('auth.genericError')).not.toBeInTheDocument()
  })

  it('drops the portal failure when another account replaces the tab', async () => {
    status = STRIPE_PRO_STATUS
    mocks.openCustomerPortal.mockRejectedValue(new Error('portal unavailable'))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.manage' }))
    expect(await screen.findByText('upgrade.billing.portalFailed')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    await waitFor(() =>
      expect(screen.queryByText('upgrade.billing.portalFailed')).not.toBeInTheDocument())
  })

  it('keeps the portal failure when the same account recovers from a rejected refresh', async () => {
    status = STRIPE_PRO_STATUS
    mocks.openCustomerPortal.mockRejectedValue(new Error('portal unavailable'))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.manage' }))
    expect(await screen.findByText('upgrade.billing.portalFailed')).toBeInTheDocument()

    await recoverSameAccount('user-1')
    respondWithAccount('user-1')

    expect(screen.getByText('upgrade.billing.portalFailed')).toBeInTheDocument()
  })

  it('does not open the previous account portal after replacement', async () => {
    status = STRIPE_PRO_STATUS
    let releasePortal!: (value: { url: string }) => void
    mocks.openCustomerPortal.mockImplementationOnce(() => new Promise((resolve) => {
      releasePortal = resolve
    }))
    vi.stubGlobal('location', { href: '' })
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.manage' }))

    await replaceAccountWith('user-2')
    await act(async () => {
      releasePortal({ url: 'https://billing.example.test/user-1' })
      await Promise.resolve()
    })

    expect(globalThis.location.href).toBe('')
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBeNull()
  })
})
