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
let billing: Record<string, unknown> = {}

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
    billing,
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
import { useAuthStore } from '@/stores/auth-store'
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
    billing = { status: 'active', cancelAtPeriodEnd: false }
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

  it.each(['stripe', 'play'] as const)(
    'waits for the first session owner before opening the %s portal',
    async (source) => {
      status = { ...STRIPE_PRO_STATUS, source }
      act(() => { useAuthStore.getState().adoptAccountFromSignal(null) })
      let finishSession!: (response: Response) => void
      vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((resolve) => {
        finishSession = resolve
      }))
      mocks.openCustomerPortal.mockResolvedValue({ url: 'https://billing.example.test/user-1' })
      vi.stubGlobal('location', { href: '' })
      render(<UpgradePage />)
      const manageName = source === 'play' ? 'upgrade.billing.actions.managePlay' : 'upgrade.billing.actions.manage'
      expect(screen.getByRole('main')).toHaveAttribute('data-state', 'loading')
      expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
      expect(screen.queryByRole('button', { name: manageName })).not.toBeInTheDocument()
      expect(mocks.openCustomerPortal).not.toHaveBeenCalled()
      expect(globalThis.location.href).toBe('')

      let sessionCheck!: Promise<void>
      act(() => { sessionCheck = useAuthStore.getState().checkSession() })
      await act(async () => {
        finishSession(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-1' }))
        await sessionCheck
      })
      const manage = screen.getByRole('button', { name: manageName })
      expect(manage).toBeEnabled()
      fireEvent.click(manage)
      await waitFor(() => expect(globalThis.location.href).not.toBe(''))
    },
  )

  it('waits for the first session owner before starting checkout', async () => {
    act(() => { useAuthStore.getState().adoptAccountFromSignal(null) })
    let finishSession!: (response: Response) => void
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((resolve) => {
      finishSession = resolve
    }))
    render(<UpgradePage />)
    expect(screen.getByRole('main')).toHaveAttribute('data-state', 'loading')
    expect(screen.queryByRole('button', { name: 'upgrade.billing.lapsed.action' })).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()

    let sessionCheck!: Promise<void>
    act(() => { sessionCheck = useAuthStore.getState().checkSession() })
    await act(async () => {
      finishSession(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-1' }))
      await sessionCheck
    })
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    expect(checkoutButton()).toBeEnabled()
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({}))
    fireEvent.click(checkoutButton())
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
  })

  it('hides cached invoice details until the first session owner arrives', async () => {
    status = STRIPE_PRO_STATUS
    billing = {
      status: 'active',
      cancelAtPeriodEnd: false,
      recentInvoices: [{
        id: 'invoice-from-previous-session',
        date: '2026-08-01T00:00:00Z',
        amountPaid: 999,
        currency: 'usd',
        billingReason: 'subscription_cycle',
        status: 'paid',
        invoicePdf: 'https://billing.example.test/invoice-from-previous-session',
        hostedInvoiceUrl: null,
      }],
    }
    act(() => { useAuthStore.getState().adoptAccountFromSignal(null) })
    render(<UpgradePage />)

    expect(screen.queryByText('upgrade.billing.invoices.title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^upgrade.billing.invoices.downloadDated/ })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('data-state', 'loading')
  })

  it('shows the next account their own lapse notice rather than the previous pitch', async () => {
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.getByText('upgrade.billing.lapsed.title')).toBeInTheDocument()
  })

  it('does not show an old portal return after the account changes during refresh', async () => {
    let finishRefresh!: () => void
    mocks.refetchStatus.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRefresh = resolve }))
    globalThis.sessionStorage.setItem('orbit.subscription.portal-return', 'user-1')
    render(<UpgradePage />)
    expect(mocks.refetchStatus).toHaveBeenCalledOnce()

    await replaceAccountWith('user-2')
    await act(async () => { finishRefresh() })

    expect(mocks.showSuccess).not.toHaveBeenCalled()
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

  it('lets the next account check out while the previous checkout remains pending', async () => {
    let finishFirst!: (response: Response) => void
    let finishSecond!: (response: Response) => void
    let checkoutRequests = 0
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      if (input === '/api/auth/session') {
        return Promise.resolve(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-2' }))
      }
      checkoutRequests += 1
      return new Promise((resolve) => {
        if (checkoutRequests === 1) finishFirst = resolve
        else finishSecond = resolve
      })
    })
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    await waitFor(() => expect(checkoutRequests).toBe(1))

    await act(async () => { await useAuthStore.getState().checkSession() })
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())
    expect(checkoutRequests).toBe(2)
    expect(checkoutButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      finishFirst({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
      await Promise.resolve()
    })
    expect(checkoutButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      finishSecond({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
      await Promise.resolve()
    })
    expect(checkoutButton()).not.toHaveAttribute('aria-busy')
  })

  it('does not acknowledge another account portal return after a cold reload', async () => {
    status = STRIPE_PRO_STATUS
    mocks.openCustomerPortal.mockResolvedValue({ url: 'https://billing.example.test/user-1' })
    vi.stubGlobal('location', { href: '' })
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.manage' }))
    await waitFor(() => expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).not.toBeNull())
    cleanup()
    holdAccount('user-2')
    render(<UpgradePage />)

    await waitFor(() => expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBeNull())
    expect(mocks.refetchStatus).not.toHaveBeenCalled()
    expect(mocks.showSuccess).not.toHaveBeenCalled()
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

  it('binds checkout to the held account before the tab learns that its cookie changed', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({}))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    fireEvent.click(checkoutButton())

    await waitFor(() => expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled())
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        'X-Orbit-Held-Account-Id': 'user-1',
      },
    })
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
