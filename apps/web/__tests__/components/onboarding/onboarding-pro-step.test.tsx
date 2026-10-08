import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { measureScrollbarGutter } from '@/e2e/layout/scrollbar-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import React from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('next-intl', () => ({ useLocale: () => mocks.locale, useTranslations: (namespace?: string) => (key: string, parameters?: Record<string, unknown>) => translate(namespace ? `${namespace}.${key}` : key, parameters) }))
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

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ finishOnboarding: vi.fn(async () => {}) }),
  useOnboardingIsLive: () => true,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({ usePushNotificationPreferences: () => ({ supported: false }) }))

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
  it.each(['en', 'pt-BR'])('exposes both loaded paywall cards to geometry checks in %s', async (locale) => {
    mocks.locale = locale
    const view = await mount()
    const step = view.container.querySelector('[data-onboarding-step="paywall"]')!
    await waitFor(() => {
      expect(step.querySelectorAll('[data-tier-reservation]')).toHaveLength(0)
      expect(step.querySelectorAll('[data-tier-content]')).toHaveLength(2)
    })
    const cards = step.querySelectorAll<HTMLElement>('[data-tier-content]')
    expect(cards).toHaveLength(2)
    expect(Array.from(cards, (card) => card.dataset.tierContent)).toEqual(['yearly', 'monthly'])
    for (const card of cards) {
      expect(card).toHaveAttribute('data-tier', card.dataset.tierContent)
      expect(within(card).getByRole('button', { name: /Subscribe|Assinar/ })).toBeEnabled()
      const outcomes = within(card).getByRole('list', { name: translate('upgrade.outcomes.label') })
      expect(within(outcomes).getAllByRole('listitem')).toHaveLength(4)
      for (const key of ['astra', 'calendar', 'retrospective', 'noticing']) {
        expect(within(outcomes).getByText(translate(`upgrade.outcomes.${key}`))).toBeInTheDocument()
      }
    }
  })

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
      await waitFor(() => {
        expect(view.container.querySelectorAll('[data-tier-reservation]')).toHaveLength(0)
        expect(view.container.querySelectorAll('[data-tier]')).toHaveLength(2)
      })
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

describe('owning onboarding pitch geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  const cases = [320, 360, 384, 412, 640, 1440].flatMap((width) => ['pt-BR', 'en']
    .flatMap((locale) => [false, true].map((trial) => ({ width, locale, trial }))))
  it.each(cases)('fits the final-step heading at $width in $locale, trial=$trial', async ({ width, locale, trial }) => {
    mocks.locale = locale
    mocks.profile = createMockProfile({ hasProAccess: trial, isTrialActive: trial, plan: trial ? 'pro' : 'free', trialEndsAt: trial ? new Date(Date.now() + 7 * 86400000).toISOString() : null })
    mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: false })
    render(<OnboardingFlow finalStepOnly />)
    const text = translate(trial ? 'onboarding.flow.trial.title' : 'upgrade.convert.freeHeading')
    await screen.findByRole('heading', { name: text })
    const page = await browser.newPage({ viewport: { width, height: 1400 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${document.body.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-onboarding-step] header :is(h1,h2)').evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const fragments = [...range.getClientRects()]
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const probe = element.cloneNode(true) as HTMLElement
        probe.style.width = 'max-content'
        document.body.append(probe)
        const textWidth = probe.getBoundingClientRect().width
        probe.remove()
        return {
          lines: new Set(fragments.map((fragment) => Math.round(fragment.top))).size,
          outside: fragments.some((fragment) => fragment.left < bounds.left - 0.5 || fragment.right > bounds.right + 0.5),
          ellipsis: style.textOverflow === 'ellipsis' || Number.parseInt(style.webkitLineClamp) > 0,
          whiteSpace: style.whiteSpace,
          fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight,
          letterSpacing: Number.parseFloat(style.letterSpacing), measure: bounds.width,
          scrollerMeasure: element.closest('[data-shell-scroller]')!.clientWidth, textWidth,
        }
      })
      process.stdout.write(`${JSON.stringify({ width, locale, trial, geometry })}\n`)
      expect(geometry.lines).toBe(1)
      expect(geometry.outside).toBe(false)
      expect(geometry.ellipsis).toBe(false)
      expect(geometry.whiteSpace).toBe('normal')
      expect(geometry.fontSize).toBe(width < 640 ? 28 : 34)
      expect(geometry.fontWeight).toBe('500')
      expect(geometry.letterSpacing).toBeCloseTo(-0.02 * geometry.fontSize)
      expect(geometry.textWidth).toBeLessThanOrEqual(geometry.measure)
      if (width === 320 && trial) expect(geometry.textWidth).toBeLessThanOrEqual(268)
      if (width < 1024) {
        const gutter = await page.locator('[data-shell-scroller]').evaluate(measureScrollbarGutter)
        expect(geometry.scrollerMeasure).toBe(width - gutter)
        expect(geometry.measure).toBe(Math.min(width - gutter, 440) - 32)
      }
      await page.locator('[data-onboarding-step] header :is(h1,h2)').evaluate((element) => {
        (element as HTMLElement).style.fontSize = `${Number.parseFloat(getComputedStyle(element).fontSize) * 2}px`
      })
      const grown = await page.locator('[data-onboarding-step] header :is(h1,h2)').evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const fragments = [...range.getClientRects()]
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          lines: new Set(fragments.map((fragment) => Math.round(fragment.top))).size,
          height: bounds.height,
          outside: fragments.some((fragment) => fragment.left < bounds.left - 0.5 || fragment.right > bounds.right + 0.5),
          clipped: [style.overflowX, style.overflowY].some((overflow) => overflow === 'hidden' || overflow === 'clip'),
        }
      })
      process.stdout.write(`${JSON.stringify({ width, locale, trial, grown })}\n`)
      if (width === 320) expect(grown.lines).toBeGreaterThan(1)
      expect(grown.height).toBeGreaterThan(geometry.fontSize * 2)
      expect(grown.outside).toBe(false)
      expect(grown.clipped).toBe(false)
    } finally { await page.close() }
  })
})
