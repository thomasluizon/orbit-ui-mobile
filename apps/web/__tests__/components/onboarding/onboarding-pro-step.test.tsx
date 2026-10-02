import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { getTrialDaysLeft } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { subscriptionPlansFixture } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import { holdAccount } from '@/__tests__/support/account-change'
import { plural } from '@/lib/plural'
import { OnboardingProStep, type OnboardingProExit } from '@/components/onboarding/onboarding-pro-step'

const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  refetch: vi.fn(), online: true, locale: 'en', plansState: 'loaded',
  checkout: vi.fn(), checkoutLoading: null as 'monthly' | 'yearly' | null,
  beforeRedirect: undefined as (() => Promise<void>) | undefined,
}))
vi.mock('next-intl', () => ({ useLocale: () => mocks.locale, useTranslations: () => translate }))
function translate(key: string, parameters?: Record<string, unknown>): string {
  let value: unknown = mocks.locale === 'pt-BR' ? ptBr : en
  for (const part of key.split('.')) value = Reflect.get(value as object, part)
  let message = String(value)
  for (const [name, parameter] of Object.entries(parameters ?? {})) message = message.replaceAll(`{${name}}`, String(parameter))
  return message
}
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, refetch: mocks.refetch }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-subscription-plans')>()),
  useSubscriptionPlans: () => ({ plans: mocks.plansState === 'loaded' ? subscriptionPlansFixture : null, isLoading: mocks.plansState === 'loading', isError: mocks.plansState === 'error', discountedAmount: (amount: number) => amount, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-stripe-checkout', () => ({ useStripeCheckout: (beforeRedirect: () => Promise<void>) => { mocks.beforeRedirect = beforeRedirect; return { checkout: mocks.checkout, checkoutLoading: mocks.checkoutLoading, checkoutError: '' } } }))

beforeEach(() => {
  vi.clearAllMocks()
  holdAccount('account-1')
  localStorage.clear()
  mocks.profile = createMockProfile({ hasProAccess: false, isTrialActive: false, isLifetimePro: false, plan: 'free', trialEndsAt: null })
  mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: false })
  mocks.online = true; mocks.locale = 'en'; mocks.plansState = 'loaded'; mocks.checkoutLoading = null
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

async function mount(profile = mocks.profile) {
  mocks.profile = profile
  const finish = vi.fn(async () => {})
  const exit = React.createRef<OnboardingProExit>()
  const view = render(<OnboardingProStep onFinish={finish} ref={exit} />)
  await waitFor(() => expect(view.container.querySelector('section[aria-busy="true"]')).toBeNull())
  return { ...view, finish, exit }
}

describe('Onboarding final Pro step', () => {
  it.each(['en', 'pt-BR'])('shows trial facts and one action in %s', async (locale) => {
    mocks.locale = locale
    const end = new Date(Date.now() + 7 * 86400000).toISOString()
    const profile = createMockProfile({ hasProAccess: true, isTrialActive: true, trialEndsAt: end, plan: 'pro' })
    mocks.refetch.mockResolvedValue({ data: profile, isError: false })
    const view = await mount(profile)
    expect(view.container.querySelector('[data-onboarding-step="trial"]')).toBeInTheDocument()
    expect(screen.getByText(plural(translate('upgrade.convert.trialDaysLeft', { days: getTrialDaysLeft(profile) }), getTrialDaysLeft(profile)!))).toBeInTheDocument()
    const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(end))
    expect(screen.getByText(translate('upgrade.billing.plan.trialHint', { date }))).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument(); expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.queryAllByRole('list', { name: translate('upgrade.outcomes.label') })).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(view.container.querySelector('[data-tier-content]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: translate('onboarding.flow.done.seeDay') }))
    await waitFor(() => expect(view.finish).toHaveBeenCalledOnce())
  })

  it.each(['loading', 'error', 'offline', 'loaded'])('keeps the paywall decline in %s', async (state) => {
    mocks.plansState = state === 'offline' ? 'loaded' : state; mocks.online = state !== 'offline'
    const view = await mount()
    expect(view.container.querySelector('[data-onboarding-step="paywall"]')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1, name: 'Orbit Pro' })
    expect(heading.id).toBe('onboarding-title'); expect(heading).toHaveAttribute('translate', 'no')
    if (state === 'offline') for (const button of screen.getAllByRole('button', { name: /Subscribe/ })) expect(button).toBeDisabled()
    if (state === 'loaded') {
      expect(screen.getAllByRole('button', { name: /Subscribe/ })).toHaveLength(2)
      const lists = screen.getAllByRole('list', { name: translate('upgrade.outcomes.label') })
      expect(lists).toHaveLength(2)
      for (const list of lists) { expect(list.closest('[data-tier]')).not.toBeNull(); expect(list.children).toHaveLength(4) }
      expect(screen.getAllByText(en.upgrade.plans.recommended).filter((element) => !element.closest('[inert]'))).toHaveLength(1)
      expect(screen.getAllByText(/42/).filter((element) => !element.closest('[inert]'))).toHaveLength(1)
    }
    fireEvent.click(screen.getByRole('link', { name: en.upgrade.convert.stayFree }))
    await waitFor(() => expect(view.finish).toHaveBeenCalledOnce())
    expect(localStorage.getItem('orbit_trial_expired_seen:account-1')).toBe('1')
  })

  it.each([false, true])('finishes paid Pro without pitching, lifetime=%s', async (lifetime) => {
    mocks.refetch.mockResolvedValue({ data: createMockProfile({ hasProAccess: !lifetime, isTrialActive: false, isLifetimePro: lifetime }), isError: false })
    const finish = vi.fn(async () => {})
    const { container } = render(<OnboardingProStep onFinish={finish} />)
    await waitFor(() => expect(finish).toHaveBeenCalledOnce())
    expect(container.querySelector('[data-onboarding-step]')).toBeNull()
  })

  it('uses the refreshed free plan after a trial expires', async () => {
    mocks.profile = createMockProfile({ hasProAccess: true, isTrialActive: true, trialEndsAt: new Date(Date.now() + 86400000).toISOString() })
    const view = await mount()
    expect(view.container.querySelector('[data-onboarding-step="paywall"]')).toBeInTheDocument()
  })

  it('does not trust an expired trial in a failed refresh cache', async () => {
    mocks.profile = createMockProfile({ hasProAccess: true, isTrialActive: true, trialEndsAt: new Date(Date.now() - 86400000).toISOString() })
    mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: true })
    const view = await mount()
    expect(view.container.querySelector('[data-onboarding-step="paywall"]')).toBeInTheDocument()
  })

  it('keeps an unknown plan on the error surface with retry and exit', async () => {
    mocks.profile = undefined
    mocks.refetch.mockResolvedValue({ data: undefined, isError: true })
    const view = await mount(undefined)
    expect(view.container.querySelector('[data-onboarding-step="paywall"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.upgrade.billing.retry }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: en.onboarding.flow.done.seeDay }))
    await waitFor(() => expect(view.finish).toHaveBeenCalledOnce())
  })

  it('locks decline, tiers, interval and Escape during checkout', async () => {
    mocks.checkoutLoading = 'yearly'
    const view = await mount()
    expect(screen.getByRole('link', { name: en.upgrade.convert.stayFree })).toHaveAttribute('aria-disabled', 'true')
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    act(() => view.exit.current?.exit('/calendar'))
    expect(view.finish).not.toHaveBeenCalled()
  })

  it('marks completion before the shared checkout hook redirects', async () => {
    const view = await mount()
    await act(async () => { await mocks.beforeRedirect?.() })
    expect(view.finish).toHaveBeenCalledOnce()
    expect(localStorage.getItem('orbit_trial_expired_seen:account-1')).toBe('1')
  })
})
