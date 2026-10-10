import { measureTextOverflow } from '../../../e2e/layout/text-overflow-geometry'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
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

async function waitForLoadedTiers(container: HTMLElement) {
  await waitFor(() => {
    expect(container.querySelectorAll('[data-tier-reservation]')).toHaveLength(0)
    for (const interval of ['yearly', 'monthly']) {
      expect(container.querySelectorAll(`[data-tier="${interval}"]`)).toHaveLength(1)
    }
  })
}

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


  const compactCases = [320, 360, 384, 412].flatMap((width) => (['en', 'pt-BR'] as const)
    .map((locale) => ({ width, locale })))

  it.each([...compactCases, { width: 1440, locale: 'en' }, { width: 1440, locale: 'pt-BR' }])('shares remaining width between label-based period segments at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><Pricing coupon={false} /></NextIntlClientProvider>)
    await waitForLoadedTiers(container)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[role="radiogroup"]').evaluate((group) => {
        const bounds = group.getBoundingClientRect()
        const column = group.parentElement!.getBoundingClientRect()
        const segments = [...group.querySelectorAll('[role="radio"]')].map((segment) => {
          const box = segment.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(segment.querySelector('span')!)
          return { width: box.width, labelWidth: range.getBoundingClientRect().width, top: box.top, height: box.height }
        })
        return { width: bounds.width, columnWidth: column.width, segments }
      })
      expect(geometry.segments).toHaveLength(2)
      expect(geometry.width).toBeCloseTo(width >= 1024 ? 320 : width - 32, 0)
      expect(geometry.width).toBeCloseTo(geometry.columnWidth, 0)
      expect(geometry.segments[0]!.top).toBeCloseTo(geometry.segments[1]!.top, 0)
      const remaining = geometry.segments.map((segment) => segment.width - segment.labelWidth)
      expect(Math.max(...remaining) - Math.min(...remaining)).toBeLessThan(0.1)
      for (const segment of geometry.segments) expect(segment.height).toBeGreaterThanOrEqual(48)
    } finally { await page.close() }
  })

  it.each(compactCases)('keeps both allowance captions whole on one line at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><Pricing coupon={false} /></NextIntlClientProvider>)
    await waitForLoadedTiers(container)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const captions = page.getByText(messages.upgrade.convert.perDay, { exact: true })
      expect(await captions.count()).toBe(2)
      const geometry = await captions.evaluateAll((elements) => elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const fragments = [...range.getClientRects()]
        const style = getComputedStyle(element)
        return {
          lines: new Set(fragments.map((fragment) => Math.round(fragment.top))).size,
          outside: fragments.some((fragment) => fragment.left < bounds.left - 1 || fragment.right > bounds.right + 1),
          ellipsis: style.textOverflow === 'ellipsis' || Number.parseInt(style.webkitLineClamp) > 0,
          fontSize: Number.parseFloat(style.fontSize),
        }
      }))
      expect(geometry).toEqual(Array.from({ length: 2 }, () => ({ lines: 1, outside: false, ellipsis: false, fontSize: 14 })))
    } finally { await page.close() }
  })

  it.each([412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('measures loaded onboarding cards at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <main className="mx-auto max-w-[560px] p-4"><div><OnboardingProStep onFinish={async () => {}} /></div></main>
    </NextIntlClientProvider>)
    await waitForLoadedTiers(container)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const step = page.locator('[data-onboarding-step="paywall"]')
      expect(await step.evaluate(measureTextOverflow)).toEqual([])
      const geometry = await step.evaluate(measureOnboardingProStep)
      expect(geometry.tiers.map((tier) => tier.interval)).toEqual(['yearly', 'monthly'])
      for (const tier of geometry.tiers) {
        expect(tier.height).toBeCloseTo(tier.contentHeight, 0)
        expect(tier.belowButton).toBeCloseTo(tier.padding, 0)
      }
      await step.locator('[data-tier-content="monthly"]').evaluate((card) => { card.style.minHeight = `${card.getBoundingClientRect().height + 80}px` })
      const stretched = await step.evaluate(measureOnboardingProStep)
      const monthly = stretched.tiers.find((tier) => tier.interval === 'monthly')!
      expect(monthly.height - monthly.contentHeight).toBeCloseTo(80, 0)
      expect(monthly.belowButton - monthly.padding).toBeCloseTo(80, 0)
    } finally { await page.close() }
  })

  it.each(cases)('hugs card content at $width in $locale, coupon: $coupon', async ({ width, locale, coupon }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><Pricing coupon={coupon} /></NextIntlClientProvider>)
    await waitForLoadedTiers(container)
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
            belowButton: bounds.bottom - button.bottom, padding: parseFloat(style.paddingBottom),
            buttonWidth: button.width, contentWidth: bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }
        }))
      process.stdout.write(`${JSON.stringify({ width, locale, coupon, geometry })}\n`)
      expect(geometry).toHaveLength(2)
      for (const card of geometry) {
        expect(card.buttonWidth).toBeLessThan(card.contentWidth)
        expect(card.height).toBeCloseTo(card.contentHeight, 0)
        expect(card.belowButton).toBeCloseTo(card.padding, 0)
      }
    } finally { await page.close() }
  })
})
