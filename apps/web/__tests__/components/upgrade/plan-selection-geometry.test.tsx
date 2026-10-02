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
import { subscriptionPlansFixtures } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

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

  it.each(cases)('hugs card content at $width in $locale, coupon: $coupon', async ({ width, locale, coupon }) => {
    const messages = locale === 'en' ? en : ptBR
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><Pricing coupon={coupon} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('section'))
        .filter((card) => card.querySelector('button') && !card.closest('[inert]'))
        .map((card) => {
          const bounds = card.getBoundingClientRect()
          const button = card.querySelector('button')!.getBoundingClientRect()
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
            belowButton: bounds.bottom - button.bottom, padding: parseFloat(style.paddingBottom) }
        }))
      process.stdout.write(`${JSON.stringify({ width, locale, coupon, geometry })}\n`)
      expect(geometry).toHaveLength(2)
      for (const card of geometry) {
        expect(card.height).toBeCloseTo(card.contentHeight, 0)
        expect(card.belowButton).toBeCloseTo(card.padding, 0)
      }
    } finally { await page.close() }
  })
})
