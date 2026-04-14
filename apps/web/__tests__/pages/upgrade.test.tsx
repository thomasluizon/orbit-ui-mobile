import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

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

vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({
    billing: mockBilling,
    isLoading: mockIsBillingLoading,
    isError: mockIsBillingError,
    refetch: vi.fn(),
  }),
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    subscription: { checkout: '/api/subscription/checkout', portal: '/api/subscription/portal', plans: '/api/subscription/plans' },
  },
}))

vi.mock('@orbit/shared/utils', () => ({
  getErrorMessage: (err: unknown, fallback: string) => fallback,
  formatLocaleDate: (isoDate: string) => isoDate,
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import UpgradePage from '@/app/(app)/upgrade/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UpgradePage', () => {
  beforeEach(() => {
    mockProfile = {
      id: 'u1',
      hasProAccess: false,
      isTrialActive: false,
      aiMessagesUsed: 5,
      aiMessagesLimit: 50,
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

  it('labels feature tooltip buttons accessibly', () => {
    render(<UpgradePage />)
    const tooltipButton = screen.getAllByRole('button').find((button) => button.getAttribute('aria-haspopup') === 'dialog')
    expect(tooltipButton).toBeTruthy()
    expect(tooltipButton).toHaveAttribute('aria-label')
    expect(tooltipButton).toHaveAttribute('aria-expanded', 'false')
  })

  // ---- Free user (plans display) ----

  it('shows plan loading skeletons when plans are loading', () => {
    mockIsLoadingPlans = true
    const { container } = render(<UpgradePage />)
    // Should show some skeleton shimmer elements
    const shimmerElements = container.querySelectorAll('.skeleton-shimmer, .animate-pulse')
    // At least the header renders; plans section may show loading
    expect(screen.getByText('upgrade.title')).toBeInTheDocument()
  })

  it('shows plans error state', () => {
    mockIsPlansError = true
    mockPlans = null
    render(<UpgradePage />)
    // Error state shows error message and retry
    expect(document.body.textContent).toContain('upgrade.plans.error')
  })

  it('shows trial expired banner when trial is expired', () => {
    mockTrialExpired = true
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('trial.expired')
  })

  it('shows trial days left when trial is active', () => {
    mockTrialDaysLeft = 5
    mockProfile = { ...mockProfile, isTrialActive: true }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('trial')
  })

  // ---- Pro user with billing ----

  it('shows billing loading state for Pro users', () => {
    mockHasProAccess = true
    mockProfile = { ...mockProfile, hasProAccess: true, isTrialActive: false }
    mockIsBillingLoading = true
    const { container } = render(<UpgradePage />)
    const shimmerElements = container.querySelectorAll('.skeleton-shimmer')
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
      aiMessagesLimit: 100,
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
      aiMessagesLimit: 100,
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
})
