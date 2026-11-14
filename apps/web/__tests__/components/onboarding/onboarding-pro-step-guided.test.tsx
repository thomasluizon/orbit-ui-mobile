import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { OnboardingProStep } from '@/components/onboarding/onboarding-pro-step'

const mocks = vi.hoisted(() => ({
  plan: 'Free' as 'Free' | 'Trial' | 'loading' | null,
  retry: vi.fn(),
  profile: undefined as Record<string, unknown> | undefined,
  online: true,
  checkout: vi.fn(),
}))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: 'en', messages: en }), useLocale: () => 'en' }
})
vi.mock('@/hooks/use-onboarding-plan', () => ({ useOnboardingPlan: () => ({ plan: mocks.plan, profile: mocks.profile, retry: mocks.retry }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({
    plans: { monthly: { unitAmount: 1990 }, yearly: { unitAmount: 11880 }, currency: 'brl', savingsPercent: 50, couponPercentOff: null },
    isLoading: false, isError: false, refetch: vi.fn(), discountedAmount: (amount: number) => amount,
  }),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))
vi.mock('@/hooks/use-stripe-checkout', () => ({ useStripeCheckout: () => ({ checkout: mocks.checkout, checkoutLoading: null, checkoutError: '' }) }))
vi.mock('@/stores/auth-store', () => ({ getHeldAccountId: () => 'account-1' }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  mocks.plan = 'Free'
  mocks.online = true
  mocks.profile = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false, aiMessagesUsed: 2, aiMessagesLimit: 5 })
})

describe('the onboarding Pro step', () => {
  it('asks the plan question with the flag on, with the usage line and the plan options', () => {
    enableTestFlags('orbit_guided_flows')
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Which plan?')
    expect(headings[0]).toHaveAttribute('id', 'onboarding-title')
    expect(headings[0]).toHaveAccessibleDescription('You used 2 of 5 AI messages.')
    expect(document.querySelectorAll('[data-option-card]')).toHaveLength(2)
    expect(document.querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it('starts the checkout of the selected plan and completes onboarding on the stay free exit, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    const onFinish = vi.fn(async () => {})
    render(<OnboardingProStep onFinish={onFinish} />)
    fireEvent.click(document.querySelector('[data-tier="monthly"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Monthly' }))
    expect(mocks.checkout).toHaveBeenCalledWith('monthly')
    fireEvent.click(screen.getByRole('link', { name: 'Stay on the free plan' }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
  })

  it('refuses the checkout offline with the reason, with the flag on', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.online = false
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(document.querySelector('[data-upgrade-offline-reason]')).toHaveTextContent(en.upgrade.billing.offline)
    expect(screen.getByRole('button', { name: /Subscribe/ })).toBeDisabled()
  })

  it('keeps the see my day exit of a trial person, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = 'Trial'
    mocks.profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2099-01-01T00:00:00Z' })
    const onFinish = vi.fn(async () => {})
    render(<OnboardingProStep onFinish={onFinish} />)
    expect(document.querySelector('[data-onboarding-orbit] [data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.onboarding.flow.trial.title)
    expect(document.querySelector('[data-onboarding-step="trial"]')).toHaveTextContent(/Your trial ends \w{3} \d{1,2}, \d{4}/)
    fireEvent.click(screen.getByRole('button', { name: en.onboarding.flow.done.seeDay }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
  })

  it('shows Orbit in Parado over the skeleton while the plan loads, with no pitch heading and the see my day exit, with the flag on', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = 'loading'
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    const state = screen.getByRole('region', { name: en.common.loading })
    expect(state).toHaveAttribute('aria-busy', 'true')
    expect(state.querySelector('[data-onboarding-orbit] [data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.queryByRole('heading', { name: 'Orbit Pro' })).toBeNull()
    expect(screen.getByRole('button', { name: en.onboarding.flow.done.seeDay })).toBeInTheDocument()
  })

  it('lets Orbit name the plan read error and reads the plan again on retry, with the flag on', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = null
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(document.querySelector('[data-onboarding-orbit] [data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.getByText(en.upgrade.orbitLine.billingError).closest('[role="alert"]')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Orbit Pro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.upgrade.billing.retry }))
    expect(mocks.retry).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })

  it.each(['loading', null, 'Trial'] as const)('keeps the current %s state with no Orbit with the flag off', (plan) => {
    mocks.plan = plan
    if (plan === 'Trial') mocks.profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2099-01-01T00:00:00Z' })
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(document.querySelector('[data-onboarding-orbit]')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(plan === 'Trial' ? en.onboarding.flow.trial.title : 'Orbit Pro')
  })

  it('renders the current paywall with the flag off', () => {
    render(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Orbit Pro')
    expect(document.querySelector('[data-upgrade-block]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Subscribe Annual, recommended' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe Monthly' })).toBeInTheDocument()
  })
})
