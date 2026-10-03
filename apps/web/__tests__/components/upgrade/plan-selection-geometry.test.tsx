import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { OnboardingProStep } from '@/components/onboarding/onboarding-pro-step'
import { measureOnboardingProStep } from '../../../e2e/layout/onboarding-pro-step-geometry'
import { subscriptionPlansFixtures } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({ plans: subscriptionPlansFixtures.brl, isLoading: false, isError: false, discountedAmount: (amount: number) => amount, refetch: vi.fn() }) }
})
vi.mock('@/hooks/use-onboarding-plan', () => ({ useOnboardingPlan: () => ({ plan: 'Free', profile: null, retry: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-stripe-checkout', () => ({ useStripeCheckout: () => ({ checkout: vi.fn(), checkoutLoading: null, checkoutError: '' }) }))

function Pricing({ coupon }: Readonly<{ coupon: boolean }>) {
  const t = useTranslations()
  return <div className="mx-auto flex max-w-[740px] flex-col gap-8 p-4">
    <ProPitch profile={null} trialDaysLeft={null} t={t} />
    <PlanSelection plans={{ ...subscriptionPlansFixtures.brl, couponPercentOff: coupon ? 23 : null }}
      isLoading={false} isError={false} isOnline discountedAmount={(amount) => amount}
      checkoutLoading={null} onCheckout={vi.fn()} onRetry={vi.fn()} t={t} />
  </div>
}

const cases = [412, 1440].flatMap((width) => (['en', 'pt-BR'] as const)
  .flatMap((locale) => [false, true].map((coupon) => ({ width, locale, coupon }))))

describe('Pro tier geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { vi.unstubAllGlobals(); await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('measures loaded onboarding cards at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <main className="mx-auto max-w-[560px] p-4"><div><OnboardingProStep onFinish={async () => {}} /></div></main>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const step = page.locator('[data-onboarding-step="paywall"]')
      const geometry = await step.evaluate(measureOnboardingProStep)
      expect(geometry.tiers.map((tier) => tier.interval)).toEqual(['yearly', 'monthly'])
      for (const tier of geometry.tiers) {
        expect(tier.height).toBeCloseTo(tier.contentHeight, 0)
        expect(tier.belowTarget).toBeCloseTo(tier.padding, 0)
      }
      await step.locator('[data-tier-content="monthly"]').evaluate((card) => { card.style.minHeight = `${card.getBoundingClientRect().height + 80}px` })
      const stretched = await step.evaluate(measureOnboardingProStep)
      const monthly = stretched.tiers.find((tier) => tier.interval === 'monthly')!
      expect(monthly.height - monthly.contentHeight).toBeCloseTo(80, 0)
      expect(monthly.belowTarget - monthly.padding).toBeCloseTo(80, 0)
    } finally { await page.close() }
  })

  it.each(cases)('hugs card content at $width in $locale, coupon: $coupon', async ({ width, locale, coupon }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><Pricing coupon={coupon} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-tier-content]'))
        .filter((card) => card.querySelector('button') && !card.closest('[inert]'))
        .map((card) => {
          const bounds = card.getBoundingClientRect()
          const action = card.querySelector('button')!
          const button = action.getBoundingClientRect()
          const target = action.parentElement!.getBoundingClientRect()
          const style = getComputedStyle(card)
          const clone = card.cloneNode(true) as HTMLElement
          clone.style.width = `${bounds.width}px`
          clone.style.height = 'auto'
          clone.style.minHeight = '0'
          clone.style.position = 'absolute'
          document.body.append(clone)
          const contentHeight = clone.getBoundingClientRect().height
          clone.remove()
          return { tier: card.querySelector('h3')!.textContent, height: bounds.height, contentHeight,
            belowButton: bounds.bottom - button.bottom, belowTarget: bounds.bottom - target.bottom, padding: parseFloat(style.paddingBottom),
            buttonWidth: button.width, contentWidth: bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
        }))
      process.stdout.write(`${JSON.stringify({ width, locale, coupon, geometry })}\n`)
      expect(geometry).toHaveLength(2)
      for (const card of geometry) {
        expect(card.buttonWidth).toBeLessThan(card.contentWidth)
        expect(card.height).toBeCloseTo(card.contentHeight, 0)
        expect(card.belowTarget).toBeCloseTo(card.padding, 0)
        expect(card.belowButton - card.belowTarget).toBeCloseTo(2, 0)
      }
    } finally { await page.close() }
  })
})
