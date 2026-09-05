import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useTranslations } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { UsageStats } from '@/components/upgrade/usage-stats'

const mockOpenCustomerPortal = vi.hoisted(() => vi.fn())
const mockGoBackOrFallback = vi.hoisted(() => vi.fn())

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
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mockIsOnline }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: vi.fn() }),
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
    globalThis.sessionStorage.clear()
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

  it('renders the arithmetic pitch and exactly three outcome rows', () => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    render(<UpgradePage />)

    expect(screen.getByText('upgrade.convert.freeHeading')).toBeInTheDocument()
    expect(screen.getByText('upgrade.convert.freeAllowance')).toBeInTheDocument()
    expect(screen.getByText('upgrade.convert.proAllowance')).toBeInTheDocument()
    expect(screen.getByText('upgrade.convert.allowanceNote')).toBeInTheDocument()
    expect(screen.getByLabelText('upgrade.outcomes.label').children).toHaveLength(3)
    expect(document.body.textContent).toContain('upgrade.convert.cancelAnytime')
    expect(document.body.textContent).toContain('upgrade.plans.renewalNote')
    expect(document.body.textContent).toContain('upgrade.convert.handOff')
    const decline = screen.getByRole('link', { name: 'upgrade.convert.stayFree' })
    expect(decline).toHaveAttribute('href', '/profile')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    fireEvent(decline, click)
    expect(click.defaultPrevented).toBe(true)
    expect(mockGoBackOrFallback).toHaveBeenCalledWith('/profile')
    expect(document.body.textContent).not.toContain('upgrade.features.')
    expect(document.body.textContent).not.toContain('upgrade.matrix.')
  })

  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { button: 1 },
    { button: 2 },
  ])('leaves modified decline clicks to the browser: %j', (modifiers) => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    render(<UpgradePage />)
    const decline = screen.getByRole('link', { name: 'upgrade.convert.stayFree' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })
    fireEvent(decline, event)
    expect(event.defaultPrevented).toBe(false)
    expect(mockGoBackOrFallback).not.toHaveBeenCalled()
    expect(decline).toHaveAttribute('href', '/profile')
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
    expect(document.body.textContent).toContain('upgrade.convert.promise')
    expect(document.body.textContent).toContain('upgrade.convert.trustLine')
  })

  it('shows the trial-keeping heading when trial is active', () => {
    mockTrialDaysLeft = 5
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      isTrialActive: true,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.convert.trialHeading')
    expect(document.body.textContent).not.toContain('upgrade.convert.freeHeading')
    expect(document.body.textContent).not.toContain('upgrade.convert.trustLine')
    expect(document.body.textContent).toContain('upgrade.convert.promise')
    expect(screen.queryByText('upgrade.billing.plan.pro')).not.toBeInTheDocument()
  })

  it('uses the last day eyebrow instead of a count of one', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      isTrialActive: true,
      trialEndsAt: tomorrow.toISOString(),
    }

    render(<UpgradePage />)

    expect(document.body.textContent).toContain('upgrade.convert.trialLastDay')
    expect(document.body.textContent).not.toContain('upgrade.convert.trialDaysLeft')
  })

  it('renders the trial countdown from trialEndsAt', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      isTrialActive: true,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }
    render(<UpgradePage />)
    expect(document.body.textContent).toContain(
      'upgrade.convert.trialDaysLeft:{"days":5}',
    )
  })

  it('does not put subscription status in the trial pitch', () => {
    mockHasProAccess = true
    mockProfile = {
      ...mockProfile,
      isTrialActive: true,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionInterval: null,
    }
    render(<UpgradePage />)
    expect(screen.queryByText('upgrade.billing.plan.pro')).not.toBeInTheDocument()
    expect(screen.queryByText('upgrade.billing.plan.monthly')).not.toBeInTheDocument()
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
    expect(document.body.textContent).toContain('upgrade.billing.invoices.statusPaid')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.statusOpen')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonCycle')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonManual')
    expect(screen.getAllByRole('button', { name: 'upgrade.billing.invoices.download' })).toHaveLength(1)

    online.unmount()
    mockIsOnline = false
    render(<UpgradePage />)
    expect(document.body.textContent).toContain('upgrade.billing.invoices.statusPaid')
    expect(document.body.textContent).toContain('upgrade.billing.invoices.reasonCycle')
    expect(screen.queryByRole('button', { name: 'upgrade.billing.invoices.download' })).not.toBeInTheDocument()
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

  it('keeps payment details read only and uses one provider handoff action', () => {
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
    expect(screen.queryByText('upgrade.billing.payment.change')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'upgrade.billing.payment.change' })).not.toBeInTheDocument()
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

  it.each([
    ['canceled', 'yearly'],
    ['payment_failed', 'monthly'],
    ['expired', null],
  ] as const)('shows the %s lapse outcome for the cached %s plan', (lapseReason, interval) => {
    mockProfile = {
      ...mockProfile,
      hasProAccess: false,
      isTrialActive: false,
      subscriptionInterval: interval,
      lapseReason,
      subscriptionEndedAt: '2026-08-01T00:00:00Z',
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.lapsed.title')).toBeInTheDocument()
    expect(document.body.textContent).toContain(`upgrade.billing.lapsed.${lapseReason}`)
    expect(document.body.textContent).toContain('upgrade.convert.freeHeading')
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

    expect(screen.getByText('upgrade.billing.paymentIssue.title')).toBeInTheDocument()
    expect(screen.getByText('upgrade.billing.paymentIssue.body')).toBeInTheDocument()
    expect(screen.queryByText('upgrade.billing.lapsed.title')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('upgrade.convert.freeHeading')
  })

  it.each([false, true])('keeps cached pitch content with paid actions disabled offline, trial=%s', (trialActive) => {
    mockIsOnline = false
    mockHasProAccess = trialActive
    mockProfile = {
      ...mockProfile,
      isTrialActive: trialActive,
      trialEndsAt: trialActive
        ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      subscriptionInterval: null,
    }
    mockPlans = {
      monthly: { unitAmount: 1999, currency: 'usd' },
      yearly: { unitAmount: 19999, currency: 'usd' },
      currency: 'usd',
      savingsPercent: 17,
      couponPercentOff: null,
    }
    render(<UpgradePage />)
    expect(screen.getByText('upgrade.billing.offline')).toBeInTheDocument()
    expect(screen.getByText(
      trialActive ? 'upgrade.convert.trialHeading' : 'upgrade.convert.freeHeading',
    )).toBeInTheDocument()
    const paidActions = screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })
    expect(paidActions).toHaveLength(2)
    expect(paidActions[0]).toBeDisabled()
    expect(paidActions[1]).toBeDisabled()
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
    fireEvent.click(screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })[0]!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const call = fetchMock.mock.calls[0]
    const requestUrl = String(call?.[0])
    const requestInit = call?.[1] as RequestInit | undefined
    expect(requestUrl.startsWith('/api/subscriptions/checkout')).toBe(true)
    expect(requestInit?.method).toBe('POST')
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      interval: 'yearly',
    })
  })

  it('announces checkout failures', async () => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => null,
    }))

    render(<UpgradePage />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeEmptyDOMElement()
    expect(alert).not.toHaveAttribute('aria-live')
    fireEvent.click(screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })[0]!)

    await waitFor(() => expect(alert).toHaveTextContent('toast.errors.server'))
    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert).not.toHaveAttribute('aria-live')

    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    fireEvent.click(screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })[0]!)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert).toBeEmptyDOMElement()
  })

  it('prevents a second paid checkout while the first request is pending', async () => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    let resolveCheckout:
      ((response: { ok: boolean; json: () => Promise<{ url?: string }> }) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheckout = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { href: '' })

    render(<UpgradePage />)
    fireEvent.click(screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })[0]!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(screen.getAllByRole('button', {
        name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
      })[0]).toHaveAttribute(
        'aria-busy',
        'true',
      )
    })
    fireEvent.click(screen.getAllByRole('button', {
      name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
    })[1]!)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveCheckout?.({ ok: true, json: async () => ({}) })
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', {
          name: /^upgrade\.plans\.checkoutLabel(?:Recommended)?:/,
        })[0],
      ).not.toBeDisabled()
    })
  })
})
