import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useTranslations } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { UsageStats } from '@/components/upgrade/usage-stats'

const mockOpenCustomerPortal = vi.hoisted(() => vi.fn())
const mockGoBackOrFallback = vi.hoisted(() => vi.fn())
const mockRefetchStatus = vi.hoisted(() => vi.fn())
const mockRefetchBilling = vi.hoisted(() => vi.fn())
const mockShowSuccess = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [k: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => mockGoBackOrFallback,
}))

vi.mock('@/app/actions/subscription', () => ({
  openCustomerPortal: (...args: unknown[]) => mockOpenCustomerPortal(...args),
}))

let mockProfile: Record<string, unknown> | null = null
let mockHasProAccess = false
let mockTrialExpired = false
let mockTrialDaysLeft: number | null = null
let mockTrialUrgent = false
let mockIsOnline = true

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
  useHasProAccess: () => mockHasProAccess,
  useTrialExpired: () => mockTrialExpired,
  useTrialDaysLeft: () => mockTrialDaysLeft,
  useTrialUrgent: () => mockTrialUrgent,
}))

vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({
    status: mockProfile
      ? {
          plan: mockHasProAccess ? 'pro' : 'free',
          hasProAccess: mockHasProAccess,
          isTrialActive: Boolean(mockProfile.isTrialActive),
          trialEndsAt: mockProfile.trialEndsAt ?? null,
          planExpiresAt: mockProfile.planExpiresAt ?? null,
          aiMessagesUsed: mockProfile.aiMessagesUsed ?? 0,
          aiMessagesLimit: mockProfile.aiMessagesLimit ?? 0,
          isLifetimePro: Boolean(mockProfile.isLifetimePro),
          subscriptionInterval: mockProfile.subscriptionInterval ?? null,
          source: mockProfile.subscriptionSource ?? null,
          lapseReason: mockProfile.lapseReason ?? null,
          subscriptionEndedAtUtc: mockProfile.subscriptionEndedAt ?? null,
        }
      : null,
    isLoading: false,
    isError: false,
    refetch: mockRefetchStatus,
  }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mockShowSuccess }),
}))

let mockPlans: Record<string, unknown> | null = null
let mockIsLoadingPlans = false
let mockIsPlansError = false

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({
    plans: mockPlans,
    isLoading: mockIsLoadingPlans,
    isError: mockIsPlansError,
    refetch: vi.fn(),
    discountedAmount: (amount: number) => amount,
  }),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

let mockBilling: Record<string, unknown> | null = null
let mockIsBillingLoading = false
let mockIsBillingError = false

const mockUseBilling = vi.fn((_enabled?: boolean) => ({
  billing: mockBilling,
  isLoading: mockIsBillingLoading,
  isError: mockIsBillingError,
  refetch: mockRefetchBilling,
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: (enabled?: boolean) => mockUseBilling(enabled),
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    subscription: {
      checkout: '/api/subscriptions/checkout',
      portal: '/api/subscriptions/portal',
      plans: '/api/subscriptions/plans',
    },
  },
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    getErrorMessage: (err: unknown, fallback: string) => fallback,
    formatLocaleDate: (isoDate: string) => isoDate,
  }
})

import UpgradePage from '@/app/(app)/upgrade/page'

function UsageStatsWithoutProfile() {
  const t = useTranslations()
  return <UsageStats usagePercent={0} usageUrgent={false} profile={null} t={t} />
}

describe('UpgradePage subscription management', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    mockProfile = {
      id: 'u1',
      hasProAccess: false,
      isTrialActive: false,
      aiMessagesUsed: 5,
      aiMessagesLimit: 20,
    }
    mockHasProAccess = false
    mockTrialExpired = false
    mockTrialDaysLeft = null
    mockTrialUrgent = false
    mockIsOnline = true
    mockPlans = null
    mockIsLoadingPlans = false
    mockIsPlansError = false
    mockBilling = null
    mockIsBillingLoading = false
    mockIsBillingError = false
    mockUseBilling.mockClear()
    mockOpenCustomerPortal.mockReset()
    mockGoBackOrFallback.mockReset()
    mockRefetchStatus.mockReset().mockResolvedValue(undefined)
    mockRefetchBilling.mockReset().mockResolvedValue(undefined)
    mockShowSuccess.mockReset()
    globalThis.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    ['stripe', 'stripe'], ['play', 'play'], ['lifetime', 'stripe'],
    ['canceled', 'stripe'], ['past-due', 'stripe'], ['lapsed', 'stripe'],
    ['loading', 'stripe'], ['load-failed', 'stripe'],
    ['offline', 'stripe'], ['offline', 'play'],
    ['portal-opening', 'stripe'], ['portal-opening', 'play'],
    ['portal-failed', 'stripe'], ['portal-failed', 'play'],
  ])('keeps one page heading in %s with provider %s', async (state, source) => {
    mockHasProAccess = state !== 'lapsed'
    mockProfile = {
      ...mockProfile, isTrialActive: false, subscriptionSource: source,
      subscriptionInterval: 'monthly', isLifetimePro: state === 'lifetime',
    }
    if (state === 'lapsed') {
      mockProfile = {
        ...mockProfile, subscriptionSource: null, subscriptionInterval: null,
        lapseReason: 'expired', subscriptionEndedAt: '2026-08-01T00:00:00Z',
      }
    }
    mockBilling = {
      interval: 'monthly', cancelAtPeriodEnd: state === 'canceled',
      status: state === 'past-due' ? 'past_due' : 'active',
      currentPeriodEnd: '2026-10-01T00:00:00Z', amountPerPeriod: 999,
      currency: 'usd', paymentMethod: null, recentInvoices: [],
    }
    mockIsBillingLoading = state === 'loading'
    mockIsBillingError = state === 'load-failed'
    mockIsOnline = state !== 'offline'
    vi.stubGlobal('location', { href: '' })
    if (state === 'portal-failed') {
      mockOpenCustomerPortal.mockRejectedValue(new Error('portal unavailable'))
      if (source === 'play') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
    } else {
      mockOpenCustomerPortal.mockReturnValue(new Promise(() => {}))
    }
    render(<UpgradePage />)
    if (state.startsWith('portal-')) {
      fireEvent.click(screen.getByRole('button', {
        name: source === 'play' ? 'upgrade.billing.actions.managePlay' : 'upgrade.billing.actions.manage',
      }))
    }
    await waitFor(() => expect(document.querySelector('main')).toHaveAttribute('data-state', state))
    const hasProviderGuidance = !['lifetime', 'lapsed', 'loading', 'load-failed'].includes(state)
    expect(screen.queryAllByText('upgrade.billing.actions.providerNote')).toHaveLength(Number(hasProviderGuidance))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('upgrade.title')
    if (!['loading', 'load-failed'].includes(state)) {
      expect(screen.getByRole('heading', {
        level: 2,
        name: state === 'lapsed' ? 'upgrade.billing.lapsed.title'
          : state === 'lifetime' ? 'upgrade.billing.plan.lifetime' : 'upgrade.billing.plan.monthly',
      })).toBeInTheDocument()
    }
  })

  it('shows billing loading state for Pro users', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockIsBillingLoading = true
    const { container } = render(<UpgradePage />)
    const shimmerElements = container.querySelectorAll('.skeleton-pulse')
    expect(shimmerElements.length).toBeGreaterThan(0)
  })

  it('shows billing error state for Pro users', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockIsBillingError = true
    mockBilling = null
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.error')).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.retry')).toBeInTheDocument()
  })

  it('shows billing plan details when loaded', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionInterval: 'monthly',
      aiMessagesUsed: 10,
      aiMessagesLimit: 500,
    }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
      },
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.monthly')).toBeInTheDocument()
  })

  it('labels the Stripe amount as the monthly plan price when catalog pricing differs', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionInterval: 'yearly',
      subscriptionSource: 'stripe',
    }
    mockPlans = {
      monthly: { unitAmount: 1999, currency: 'usd' },
      yearly: { unitAmount: 19999, currency: 'usd' },
      currency: 'usd',
      savingsPercent: 17,
      couponPercentOff: null,
    }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 777,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.monthly')).toBeInTheDocument()
    expect(
      screen.getByText('upgrade.billing.plan.monthlyPrice:{"price":"usd 7.77"}'),
    ).toBeInTheDocument()
    expect(en.upgrade.billing.plan.monthlyPrice).toBe('Monthly plan price: {price}')
    expect(document.body.textContent).not.toContain('usd 199.99')
  })

  it('shows yearly plan label for yearly billing', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'yearly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2026-01-15T00:00:00Z',
      amountPerPeriod: 7999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.yearly')).toBeInTheDocument()
  })

  it('shows canceled badge when subscription is canceling', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: true,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.canceledBadge')).toBeInTheDocument()
    expect(document.body.textContent).toContain('upgrade.billing.plan.canceledHint')
  })

  it('uses a neutral Pro label when Stripe omits interval, price, and renewal', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      planExpiresAt: null,
    }
    mockBilling = {
      interval: null,
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: null,
      amountPerPeriod: 0,
      currency: null,
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.pro')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('upgrade.billing.plan.monthlyPrice')
    expect(document.body.textContent).not.toContain('upgrade.billing.plan.renewsOn')
  })

  it('shows payment method details', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
      },
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.billing.payment.card')
    expect(document.body.textContent).toContain('upgrade.billing.payment.expires')
  })

  it('renders paid and open invoice outcomes with only the available download action', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [
        {
          id: 'invoice-paid',
          date: '2026-08-01T00:00:00Z',
          amountPaid: 999,
          currency: 'usd',
          status: 'paid',
          hostedInvoiceUrl: null,
          invoicePdf: 'https://billing.test/invoice.pdf',
          billingReason: 'subscription_cycle',
        },
        {
          id: 'invoice-open',
          date: '2026-08-02T00:00:00Z',
          amountPaid: 999,
          currency: 'usd',
          status: 'open',
          hostedInvoiceUrl: null,
          invoicePdf: null,
          billingReason: 'manual',
        },
      ],
    }
    const online = render(<UpgradePage />)
    expect(document.body.textContent.match(/upgrade\.billing\.invoices\.statusPaid/g)).toHaveLength(1)
    expect(document.body.textContent.match(/upgrade\.billing\.invoices\.statusOpen/g)).toHaveLength(1)
    expect(screen.getAllByText('usd 9.99', { exact: true })).toHaveLength(2)
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonCycle')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonManual')
    expect(screen.getAllByRole('button', { name: /^upgrade\.billing\.invoices\.downloadDated:/ })).toHaveLength(1)

    online.unmount()
    mockIsOnline = false
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.billing.invoices.statusPaid')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonCycle')
    expect(screen.queryByRole('button', { name: /^upgrade\.billing\.invoices\.downloadDated:/ })).not.toBeInTheDocument()
  })

  it('shows usage stats for Pro users with billing', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      aiMessagesUsed: 10,
      aiMessagesLimit: 500,
    }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.billing.usage.title')
    expect(document.body.textContent).toContain('upgrade.billing.usage.aiMessages')
    expect(document.body.textContent).not.toContain('upgrade.billing.usage.nearLimit')
  })

  it('renders zero cached usage when profile content is unavailable', () => {
    render(<UsageStatsWithoutProfile />)
    expect(
      screen.getByText('upgrade.billing.usage.aiMessagesOf:{"used":0,"limit":0}'),
    ).toBeInTheDocument()
  })

  it('shows the capacity notice when Pro usage reaches the warning threshold', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      aiMessagesUsed: 40,
      aiMessagesLimit: 50,
    }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.usage.nearLimit')).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.usage.nearLimitBody')).toBeInTheDocument()
  })

  it('keeps card details visible with a change action and one filled provider action', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: {
        brand: 'mastercard',
        last4: '1234',
        expMonth: 6,
        expYear: 2027,
      },
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByRole('button', { name: 'upgrade.billing.payment.change' })).toBeEnabled()
    expect(screen.getByText('upgrade.billing.actions.manage')).toBeInTheDocument()
  })

  it('shows past_due badge when billing status is past_due', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'past_due',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: null,
      recentInvoices: [],
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.plan.pastDue')).toBeInTheDocument()
  })

  it('renders the portal failure and leaves payment details read only', async () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockBilling = {
      interval: 'monthly',
      cancelAtPeriodEnd: false,
      status: 'active',
      currentPeriodEnd: '2025-07-15T00:00:00Z',
      amountPerPeriod: 999,
      currency: 'usd',
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
      },
      recentInvoices: [],
    }
    mockOpenCustomerPortal.mockRejectedValue(new Error('portal unavailable'))
    render(<UpgradePage />)

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.manage' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('upgrade.billing.portalFailed')
    expect(screen.getByRole('button', { name: 'upgrade.billing.retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'upgrade.billing.payment.change' })).toBeDisabled()
  })

  it('shows the Google Play management panel for Play-sourced Pro users', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionSource: 'play',
      subscriptionInterval: 'yearly',
      planExpiresAt: '2026-07-15T00:00:00Z',
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.actions.managePlay')).toBeInTheDocument()
    expect(screen.queryByText('upgrade.billing.actions.manage')).not.toBeInTheDocument()
  })

  it('hands a web Play subscriber to Play without opening a Stripe portal', async () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, isTrialActive: false, subscriptionSource: 'play' }
    const location = { href: '' }
    vi.stubGlobal('location', location)
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.actions.managePlay' }))
    await waitFor(() => expect(location.href).toBe('https://play.google.com/store/account/subscriptions?sku=orbit_pro&package=org.useorbit.app'))
    expect(mockOpenCustomerPortal).not.toHaveBeenCalled()
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1')
  })

  it.each(['stripe', 'play'])('recovers the %s handoff after Back restores the page from bfcache', async (source) => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, isTrialActive: false, subscriptionSource: source }
    mockOpenCustomerPortal.mockResolvedValue({ url: 'https://billing.test/portal' })
    vi.stubGlobal('location', { href: '' })
    render(<UpgradePage />)
    const action = screen.getByRole('button', {
      name: source === 'play' ? 'upgrade.billing.actions.managePlay' : 'upgrade.billing.actions.manage',
    })
    fireEvent.click(action)
    await waitFor(() => expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1'))
    expect(action).toBeDisabled()

    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: false }))
    expect(action).toBeDisabled()
    expect(mockRefetchStatus).not.toHaveBeenCalled()
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1')

    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
    await waitFor(() => expect(action).toBeEnabled())
    expect(action).not.toHaveAttribute('aria-busy', 'true')
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBeNull()
    expect(mockRefetchStatus).toHaveBeenCalledTimes(1)
    expect(mockRefetchBilling).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('upgrade.billing.portalReturned'))

    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
    expect(mockRefetchStatus).toHaveBeenCalledTimes(1)
    expect(mockRefetchBilling).toHaveBeenCalledTimes(1)
  })

  it('refreshes once when a new page mounts after a portal return', async () => {
    globalThis.sessionStorage.setItem('orbit.subscription.portal-return', '1')
    render(<UpgradePage />)
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('upgrade.billing.portalReturned'))
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBeNull()
    expect(mockRefetchStatus).toHaveBeenCalledTimes(1)
    expect(mockRefetchBilling).toHaveBeenCalledTimes(1)
  })

  it.each(['stripe', 'play'])('recovers the %s visibility return once even when pageshow also fires', async (source) => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, isTrialActive: false, subscriptionSource: source }
    mockOpenCustomerPortal.mockResolvedValue({ url: 'https://billing.test/portal' })
    vi.stubGlobal('location', { href: '' })
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<UpgradePage />)
    const action = screen.getByRole('button', {
      name: source === 'play' ? 'upgrade.billing.actions.managePlay' : 'upgrade.billing.actions.manage',
    })
    fireEvent(document, new Event('visibilitychange'))
    expect(mockRefetchStatus).not.toHaveBeenCalled()
    fireEvent.click(action)
    await waitFor(() => expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1'))
    visibility.mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(action).toBeDisabled()
    expect(mockRefetchStatus).not.toHaveBeenCalled()
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1')

    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
    fireEvent(document, new Event('visibilitychange'))
    expect(action).toBeEnabled()
    expect(action).not.toHaveAttribute('aria-busy', 'true')
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBeNull()
    expect(mockRefetchStatus).toHaveBeenCalledTimes(1)
    expect(mockRefetchBilling).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledTimes(1))
  })

  it('stops listening for portal returns when the screen unmounts', () => {
    const page = render(<UpgradePage />)
    page.unmount()
    globalThis.sessionStorage.setItem('orbit.subscription.portal-return', '1')
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(mockRefetchStatus).not.toHaveBeenCalled()
    expect(mockRefetchBilling).not.toHaveBeenCalled()
    expect(globalThis.sessionStorage.getItem('orbit.subscription.portal-return')).toBe('1')
  })

  it('labels entitled Play cancellation as access ending and keeps the provider action', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile, isTrialActive: false, subscriptionSource: 'play', subscriptionInterval: 'yearly',
      lapseReason: 'canceled', planExpiresAt: '2026-10-04T12:00:00Z',
    }
    render(<UpgradePage />)
    expect(mockUseBilling).toHaveBeenCalledWith(false)
    expect(screen.getByText('upgrade.billing.plan.canceledBadge')).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.plan.canceledBody:{"limit":20}')).toBeInTheDocument()
    expect(screen.getByText(/^upgrade\.billing\.plan\.canceledHint:/)).toHaveTextContent('2026-10-04')
    expect(document.body.textContent).not.toContain('upgrade.billing.plan.renewsOn')
    expect(screen.getByRole('button', { name: 'upgrade.billing.actions.managePlay' })).toBeEnabled()
    expect(screen.getByText('upgrade.billing.usage.title')).toBeInTheDocument()
  })

  it('keeps the action name and usage while the Stripe portal is opening', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, isTrialActive: false, subscriptionSource: 'stripe' }
    mockOpenCustomerPortal.mockReturnValue(new Promise(() => {}))
    render(<UpgradePage />)
    const action = screen.getByRole('button', { name: 'upgrade.billing.actions.manage' })
    fireEvent.click(action)
    expect(action).toBeDisabled()
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('upgrade.billing.usage.title')).toBeInTheDocument()
    expect(document.querySelector('main')).toHaveAttribute('data-state', 'portal-opening')
  })

  it('does not substitute Stripe catalog pricing on the Play management panel', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionSource: 'play',
      subscriptionInterval: 'yearly',
      planExpiresAt: '2026-07-15T00:00:00Z',
    }
    mockPlans = {
      monthly: { unitAmount: 1999, currency: 'usd' },
      yearly: { unitAmount: 19999, currency: 'usd' },
      currency: 'usd',
      savingsPercent: 17,
      couponPercentOff: null,
    }
    render(<UpgradePage />)
    expect(document.body.textContent).not.toContain('upgrade.billing.plan.yearlyPrice')
    expect(document.body.textContent).not.toContain('usd 199.99')
  })

  it.each([
    ['monthly', 'upgrade.billing.plan.monthly'],
    [null, 'upgrade.billing.plan.pro'],
  ] as const)('shows the %s Play interval without inventing a renewal', (interval, label) => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionSource: 'play',
      subscriptionInterval: interval,
      planExpiresAt: null,
    }
    render(<UpgradePage />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('upgrade.billing.plan.renewsOn')
  })

  it.each(['canceled', 'payment_failed', 'expired'] as const)('shows the %s lapse outcome after entitlement is cleared', (lapseReason) => {
    mockProfile = {
      ...mockProfile,
      hasProAccess: false,
      isTrialActive: false,
      subscriptionInterval: null,
      subscriptionSource: null,
      planExpiresAt: null,
      lapseReason,
      subscriptionEndedAt: '2026-08-01T00:00:00Z',
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.lapsed.title')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(`upgrade.billing.lapsed.${lapseReason}`)
    expect(document.body.textContent).toContain('upgrade.billing.lapsed.ended')
    expect(document.body.textContent).toContain('2026-08-01')
    expect(document.body.textContent).toContain('upgrade.billing.usage.title')
    expect(screen.getByText('upgrade.billing.lapsed.features')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('upgrade.convert.freeHeading')
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.billing.lapsed.action' }))
    expect(document.body.textContent).toContain('upgrade.convert.freeHeading')
    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()
  })

  it('keeps Pro access truthful after a failed payment', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionSource: 'stripe',
      lapseReason: 'payment_failed',
      subscriptionEndedAt: '2026-08-01T00:00:00Z',
    }
    mockBilling = { status: 'past_due', cancelAtPeriodEnd: false }

    render(<UpgradePage />)

    expect(screen.getByText('upgrade.billing.plan.pastDue')).toBeInTheDocument()
    expect(document.body.textContent).toContain('upgrade.billing.plan.pastDueBody')
    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('upgrade.convert.freeHeading')
  })

  it('keeps the Play dashboard and disables its handoff while offline', () => {
    mockIsOnline = false
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      subscriptionSource: 'play',
      subscriptionInterval: 'yearly',
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'upgrade.billing.actions.managePlay' })).toBeDisabled()
    expect(screen.queryByText('upgrade.billing.actions.manage')).not.toBeInTheDocument()
  })

  it('skips Stripe billing and shows the lifetime panel for lifetime Pro users', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      hasProAccess: true,
      isTrialActive: false,
      isLifetimePro: true,
    }
    mockBilling = null
    render(<UpgradePage />)
    expect(mockUseBilling).toHaveBeenCalledWith(false)
    expect(screen.getByText('upgrade.billing.plan.lifetime')).toBeInTheDocument()
    expect(screen.queryByText('upgrade.billing.error')).not.toBeInTheDocument()
  })

})
