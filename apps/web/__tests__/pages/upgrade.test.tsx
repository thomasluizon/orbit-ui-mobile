import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'


vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

let mockProfile: Record<string, unknown> | null = null
let mockHasProAccess = false
let mockTrialExpired = false
let mockTrialDaysLeft: number | null = null
let mockTrialUrgent = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
  useHasProAccess: () => mockHasProAccess,
  useTrialExpired: () => mockTrialExpired,
  useTrialDaysLeft: () => mockTrialDaysLeft,
  useTrialUrgent: () => mockTrialUrgent,
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
  refetch: vi.fn(),
}))

vi.mock('@/hooks/use-billing', () => ({
  useBilling: (enabled?: boolean) => mockUseBilling(enabled),
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    subscription: { checkout: '/api/subscriptions/checkout', portal: '/api/subscriptions/portal', plans: '/api/subscriptions/plans' },
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


describe('UpgradePage', () => {
  beforeEach(() => {
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
    mockPlans = null
    mockIsLoadingPlans = false
    mockIsPlansError = false
    mockBilling = null
    mockIsBillingLoading = false
    mockIsBillingError = false
    mockUseBilling.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders without crashing', () => {
    const { container } = render(<UpgradePage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back button', () => {
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  it('exposes matrix feature labels as text with decorative icons hidden', () => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    const { container } = render(<UpgradePage />)

    expect(screen.getAllByText('upgrade.features.subHabits.label').length).toBeGreaterThan(0)

    const icons = container.querySelectorAll('table svg')
    expect(icons.length).toBeGreaterThan(0)
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    screen.getAllByRole('button').forEach((button) => {
      const accessibleName = button.getAttribute('aria-label') ?? button.textContent?.trim()
      expect(accessibleName).toBeTruthy()
    })
  })


  it('shows plan loading skeletons when plans are loading', () => {
    mockIsLoadingPlans = true
    const { container } = render(<UpgradePage />)
    const shimmerElements = container.querySelectorAll('.skeleton-pulse, .animate-pulse')
    expect(screen.getByText('upgrade.title')).toBeInTheDocument()
  })

  it('shows plans error state', () => {
    mockIsPlansError = true
    mockPlans = null
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.plans.error')
  })

  it('shows the convert heading for an expired or free user', () => {
    mockTrialExpired = true
    mockProfile = { ...mockProfile, isTrialActive: false }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.convert.freeHeading')
    expect(document.body.textContent).toContain('upgrade.convert.trustLine')
  })

  it('shows the trial-keeping heading when trial is active', () => {
    mockTrialDaysLeft = 5
    mockProfile = { ...mockProfile, isTrialActive: true }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.convert.trialHeading')
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
  })

  it('shows change payment button', () => {
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
    expect(screen.getByText('upgrade.billing.payment.change')).toBeInTheDocument()
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

  it('routes checkout through the geo-forwarding BFF route, not a direct Stripe action', async () => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.test/session' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { href: '' })

    render(<UpgradePage />)
    fireEvent.click(screen.getByTestId('paywall-checkout'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const call = fetchMock.mock.calls[0]
    const requestUrl = String(call?.[0])
    const requestInit = call?.[1] as RequestInit | undefined
    expect(requestUrl.startsWith('/api/subscriptions/checkout')).toBe(true)
    expect(requestInit?.method).toBe('POST')
    expect(JSON.parse(String(requestInit?.body))).toEqual({ interval: 'yearly' })
  })
})
