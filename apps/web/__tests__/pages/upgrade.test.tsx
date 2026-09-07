import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

describe('UpgradePage', () => {
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

  it.each([false, true])('nests the complete purchase heading outline, trial=%s', (trialActive) => {
    mockHasProAccess = trialActive
    mockProfile = { ...mockProfile, isTrialActive: trialActive }
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    render(<UpgradePage />)
    expect(screen.getAllByRole('heading').map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      name: heading.textContent,
    }))).toEqual([
      { level: 1, name: 'upgrade.title' },
      { level: 2, name: trialActive ? 'upgrade.convert.trialHeading' : 'upgrade.convert.freeHeading' },
      { level: 3, name: 'upgrade.outcomes.calendar.title' },
      { level: 3, name: 'upgrade.outcomes.retrospective.title' },
      { level: 3, name: 'upgrade.outcomes.noticing.title' },
      { level: 3, name: 'upgrade.plans.yearly.name' },
      { level: 3, name: 'upgrade.plans.monthly.name' },
      { level: 2, name: 'upgrade.billing.usage.title' },
    ])
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
    { altKey: true },
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

  it.each([
    {},
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])('cancels decline activation during checkout: %j', (modifiers) => {
    mockPlans = {
      monthly: { unitAmount: 999 },
      yearly: { unitAmount: 4999 },
      currency: 'usd',
      savingsPercent: 58,
      couponPercentOff: null,
    }
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<UpgradePage />)
    fireEvent.click(screen.getByRole('button', {
      name: /^upgrade\.plans\.checkoutLabelRecommended:/,
    }))

    const decline = screen.getByRole('link', { name: 'upgrade.convert.stayFree' })
    expect(decline).toHaveAttribute('aria-disabled', 'true')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })
    fireEvent(decline, event)
    expect(event.defaultPrevented).toBe(true)
    expect(mockGoBackOrFallback).not.toHaveBeenCalled()
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
  })})
