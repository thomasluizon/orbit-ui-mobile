import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import { billingDetailsFixture } from '@/test-support/hermetic/mock-api/fixtures/subscriptions'
import { subscriptionPlansFixtures } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import AboutPage from '@/app/(app)/about/page'
import SupportPage from '@/app/(app)/support/page'
import UpgradePage from '@/app/(app)/upgrade/page'
import { useAuthStore } from '@/stores/auth-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'pt-BR',
  status: null as ReturnType<typeof subscriptionStatusSchema.parse> | null,
  loading: false,
  failed: false,
  online: true,
  header: null as (() => ReactNode) | null,
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useLocale: () => mocks.locale,
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellHeaderSlot: (renderer: () => ReactNode) => {
  mocks.header = renderer
  return true
} }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({ FeatureGuideDrawer: () => null }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: profileFixture }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-subscription-status', () => ({ useSubscriptionStatus: () => ({
  status: mocks.status, isLoading: mocks.loading, isError: mocks.failed, refetch: vi.fn(),
}) }))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-subscription-plans')>(),
  useSubscriptionPlans: () => ({
  plans: subscriptionPlansFixtures.usd, isLoading: false, isError: false, refetch: vi.fn(),
  discountedAmount: (amount: number) => amount,
}) }))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ billing: billingDetailsFixture, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-stripe-checkout', () => ({ useStripeCheckout: () => ({ checkout: vi.fn(), checkoutLoading: null, checkoutError: '' }) }))
vi.mock('@/hooks/use-stripe-checkout-return', () => ({ useStripeCheckoutReturn: () => ({ hasReturnError: false, isSettling: false }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: vi.fn(), showPersistentError: vi.fn() }) }))
vi.mock('@/lib/actions/support', () => ({ sendSupportMessage: vi.fn() }))

const cases = ['about', 'support', 'support-success', 'free', 'lapsed', 'stripe', 'play', 'loading', 'load-failed', 'offline'] as const

describe('sub-screen start edges in isolated Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)
  beforeEach(() => {
    mocks.status = subscriptionStatusSchema.parse({ ...profileFixture, source: null })
    mocks.loading = false
    mocks.failed = false
    mocks.online = true
    mocks.header = null
    localStorage.clear()
    useAuthStore.getState().setAuth({ userId: 'subscreen-account', name: profileFixture.name, email: profileFixture.email })
  })

  for (const locale of ['en', 'pt-BR'] as const) {
    for (const width of [412, 840, 1100, 1352]) {
      it.each(cases)(`starts %s at the header inset with its cap at ${width}px in ${locale}`, async (state) => {
        mocks.locale = locale
        mocks.loading = state === 'loading'
        mocks.failed = state === 'load-failed'
        mocks.online = state !== 'offline'
        if (state === 'lapsed') mocks.status = subscriptionStatusSchema.parse({ ...mocks.status, lapseReason: 'expired' })
        if (state === 'stripe' || state === 'play') mocks.status = subscriptionStatusSchema.parse({
          ...mocks.status, plan: 'pro', hasProAccess: true, isTrialActive: false, source: state,
        })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const support = state.startsWith('support')
        const view = render(<QueryClientProvider client={client}>
          {state === 'about' ? <AboutPage /> : support ? <SupportPage /> : <UpgradePage />}
        </QueryClientProvider>)
        if (state === 'support-success') {
          fireEvent.click(screen.getAllByRole('radio')[0]!)
          const words = locale === 'en' ? en : ptBR
          fireEvent.change(screen.getByRole('textbox', { name: words.profile.support.message }), { target: { value: 'Support request' } })
          fireEvent.click(screen.getByRole('button', { name: words.profile.support.send }))
          await waitFor(() => expect(screen.getByRole('heading', { name: words.profile.support.success })).toBeInTheDocument())
        }
        const header = render(mocks.header!())
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await page.setContent(`<style>${stylesheet}</style><main style="width:${Math.min(width, 736)}px">${header.container.innerHTML}${view.container.innerHTML}</main>`)
          await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()))
          const geometry = await page.evaluate((state) => {
            const bounds = (element: Element) => {
              const rect = element.getBoundingClientRect()
              return { left: rect.left, width: rect.width }
            }
            const back = document.querySelector('main > header button')!
            const upgrade = document.querySelector('[data-upgrade-screen]')
            if (upgrade) {
              const body = state === 'free' || state === 'offline'
                ? upgrade.querySelector('h2')! : state === 'loading' || state === 'load-failed'
                  ? upgrade.firstElementChild! : upgrade.querySelector('section')!
              return { back: bounds(back), body: bounds(body), box: bounds(upgrade) }
            }
            if (state === 'about') {
              const body = document.querySelector('[data-testid="about-identity"]')!
              return { back: bounds(back), body: bounds(body), box: bounds(document.querySelector('main > div')!) }
            }
            const body = state === 'support-success'
              ? document.querySelector('h2')!.parentElement! : document.querySelector('form button')!
            return { back: bounds(back), body: bounds(body), box: bounds(document.querySelector('main > div')!) }
          }, state)
          expect.soft(Math.abs(geometry.body.left - geometry.back.left - 8)).toBeLessThanOrEqual(0.5)
          expect.soft(geometry.box.width).toBe(Math.min(width, state === 'about' || support ? (width < 768 ? width : 620) : state === 'free' || state === 'offline' ? 652 : 560))
          if (state === 'support') expect(geometry.body.width).toBeLessThanOrEqual(520)
        } finally { await page.close(); header.unmount(); view.unmount(); client.clear() }
      })
    }
  }
})
