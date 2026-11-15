import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { SheetHandle } from '@/components/ui/sheet'
import { TrialExpiredDialog } from '@/components/ui/trial-expired-dialog'
import { GuidedPricingSection } from '@/components/upgrade/guided-pricing-section'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { subscriptionPlansFixtures } from '@/test-support/hermetic/mock-api/fixtures/subscription-plans'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/upgrade', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-subscription-plans', async () => {
  const pricing = await import('@orbit/shared/utils/subscription-pricing')
  return { ...pricing, useSubscriptionPlans: () => ({}) }
})

const HEIGHT = 780
const MIN_TARGET = 48
const PAUSED_FEATURES = ['trial.expired.astraCeiling', 'trial.expired.calendarSync', 'trial.expired.retrospective', 'trial.expired.proactiveAstra'] as const
const cases = ([320, 360, 384, 412] as const).flatMap((width) => (['pt-BR', 'en'] as const).map((locale) => ({ width, locale })))

function PlanQuestion() {
  const t = useTranslations()
  return (
    <div data-free-area="" className="mx-auto flex w-full flex-col p-4">
      <GuidedPricingSection
        profile={{ isTrialActive: false, aiMessagesPeriod: 'day' }} usage={{ aiMessagesUsed: 3, aiMessagesLimit: 5 }}
        plans={{ ...subscriptionPlansFixtures.brl, couponPercentOff: 23 }} isLoadingPlans={false} isPlansError={false} isOnline trialDaysLeft={null}
        checkoutLoading={null} checkoutError="" discountedAmount={(amount) => amount} onCheckout={vi.fn()} onStayFree={vi.fn()} onRetryPlans={vi.fn()} t={t}
      />
    </div>
  )
}

describe('the plan question and the trial expired dialog in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function openPage(width: number, height = HEIGHT) {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height } })
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
    await loadAppFonts(page)
    return page
  }

  function stubViewport(width: number) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  }

  it.each(cases)('centres the plan block, keeps each plan card inside it and fits each label on one line at $width px in $locale', async ({ width, locale }) => {
    stubViewport(width)
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><PlanQuestion /></NextIntlClientProvider>)
    await screen.findByRole('heading', { level: 1 })
    const page = await openPage(width)
    try {
      const geometry = await page.evaluate(() => {
        const lines = (element: Element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          const tops = new Set<number>()
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const range = document.createRange()
            range.selectNodeContents(text)
            for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
          }
          return tops.size
        }
        const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, height: rect.height } }
        /** The press target: the box plus the hit area that a small pill draws past its edges with `::after`. */
        const target = (element: Element) => {
          const after = getComputedStyle(element, '::after')
          const reach = after.content === 'none' ? 0 : Math.max(0, -parseFloat(after.top)) + Math.max(0, -parseFloat(after.bottom))
          return { ...box(element), height: element.getBoundingClientRect().height + (Number.isNaN(reach) ? 0 : reach) }
        }
        const block = document.querySelector('[data-upgrade-block]')!
        const cards = [...block.querySelectorAll('[data-option-card]')]
        const primary = document.querySelector('[data-flow-footer] button')!
        const stayFree = block.querySelector('a[href]')!
        return {
          viewport: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          free: box(document.querySelector('[data-free-area]')!),
          block: box(block),
          questionLines: lines(block.querySelector('h1')!),
          cards: cards.map((card) => ({ ...box(card), clipped: card.scrollWidth > card.clientWidth, nameLines: lines(card.querySelector('span > span')!) })),
          primary: { ...target(primary), lines: lines(primary) },
          footer: box(document.querySelector('[data-flow-footer]')!),
          stayFree: { ...target(stayFree), lines: lines(stayFree) },
        }
      })
      const evidence = JSON.stringify(geometry)
      expect(geometry.pageWidth, evidence).toBeLessThanOrEqual(geometry.viewport)
      expect(Math.abs((geometry.block.left + geometry.block.right) / 2 - (geometry.free.left + geometry.free.right) / 2), evidence).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.block.left + geometry.block.right) / 2 - geometry.viewport / 2), evidence).toBeLessThanOrEqual(1)
      expect(geometry.questionLines, evidence).toBeLessThanOrEqual(2)
      expect(geometry.cards, evidence).toHaveLength(2)
      for (const card of geometry.cards) {
        expect(card.clipped, evidence).toBe(false)
        expect(card.left, evidence).toBeGreaterThanOrEqual(geometry.block.left - 0.5)
        expect(card.right, evidence).toBeLessThanOrEqual(geometry.block.right + 0.5)
        expect(card.height, evidence).toBeGreaterThanOrEqual(MIN_TARGET)
        expect(card.nameLines, evidence).toBe(1)
      }
      expect(geometry.primary.lines, evidence).toBe(1)
      expect(geometry.primary.height, evidence).toBeGreaterThanOrEqual(MIN_TARGET)
      expect(Math.abs((geometry.primary.right - geometry.primary.left) - (geometry.footer.right - geometry.footer.left)), evidence).toBeLessThanOrEqual(1)
      expect(geometry.stayFree.lines, evidence).toBe(1)
      expect(geometry.stayFree.height, evidence).toBeGreaterThanOrEqual(MIN_TARGET)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })

  it.each(['pt-BR', 'en'] as const)('pins the primary action to the bottom while the block scrolls, and never covers the last plan card, at 375 x 667 in %s', async (locale) => {
    stubViewport(375)
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><PlanQuestion /></NextIntlClientProvider>)
    await screen.findByRole('heading', { level: 1 })
    const page = await openPage(375, 667)
    try {
      const geometry = await page.evaluate(() => {
        const footer = document.querySelector('[data-flow-footer]')!
        const cards = [...document.querySelectorAll('[data-upgrade-block] [data-option-card]')]
        const lastCard = cards.at(-1)!
        const scroller = document.scrollingElement!
        const read = (top: number) => {
          window.scrollTo(0, top)
          const footerBox = footer.getBoundingClientRect()
          return { scrollTop: scroller.scrollTop, footerTop: footerBox.top, footerBottom: footerBox.bottom, lastCardBottom: lastCard.getBoundingClientRect().bottom }
        }
        const end = scroller.scrollHeight - window.innerHeight
        return { viewport: window.innerHeight, end, start: read(0), middle: read(Math.round(end / 2)), last: read(end), inBlock: document.querySelector('[data-upgrade-block] [data-flow-primary]') !== null }
      })
      const evidence = JSON.stringify(geometry)
      expect(geometry.inBlock, evidence).toBe(false)
      expect(geometry.end, evidence).toBeGreaterThan(0)
      expect(Math.abs(geometry.start.footerBottom - geometry.viewport), evidence).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.middle.footerBottom - geometry.viewport), evidence).toBeLessThanOrEqual(1)
      expect(geometry.middle.scrollTop, evidence).toBeGreaterThan(0)
      expect(geometry.last.footerBottom, evidence).toBeLessThanOrEqual(geometry.viewport + 1)
      expect(geometry.last.lastCardBottom, evidence).toBeLessThanOrEqual(geometry.last.footerTop)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })

  it.each(cases)('centres the trial expired dialog on both axes and fits each action on one line at $width px in $locale', async ({ width, locale }) => {
    stubViewport(width)
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <TrialExpiredDialog sheetRef={createRef<SheetHandle>()} pausedFeatures={PAUSED_FEATURES} savingsPercent={41} onSeePlans={vi.fn()} onContinueFree={vi.fn()} onClose={vi.fn()} />
    </NextIntlClientProvider>)
    await screen.findByRole('dialog')
    const page = await openPage(width)
    try {
      const geometry = await page.evaluate(() => {
        const lines = (element: Element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          const tops = new Set<number>()
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const range = document.createRange()
            range.selectNodeContents(text)
            for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
          }
          return tops.size
        }
        const panel = document.querySelector('.orbit-sheet-panel[data-centred="true"]')!.getBoundingClientRect()
        return {
          panel: { top: panel.top, bottom: panel.bottom, left: panel.left, right: panel.right },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          actionLines: [...document.querySelectorAll('[data-trial-expired-dialog] button')].map(lines),
        }
      })
      const evidence = JSON.stringify(geometry)
      expect(geometry.panel.bottom - geometry.panel.top, evidence).toBeGreaterThan(MIN_TARGET * 2)
      expect(Math.abs((geometry.panel.top + geometry.panel.bottom) / 2 - geometry.viewport.height / 2), evidence).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.panel.left + geometry.panel.right) / 2 - geometry.viewport.width / 2), evidence).toBeLessThanOrEqual(1)
      expect(geometry.actionLines, evidence).toEqual([1, 1])
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
