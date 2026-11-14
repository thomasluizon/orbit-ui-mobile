import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { SETTLE_DELAY_MS } from '@orbit/shared/utils'
import { settleAnimations } from '@/e2e/layout/settle-animations'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const wrapped = vi.hoisted(() => ({ current: { recap: null as unknown, isEmpty: false, isLoading: false, isError: false } }))

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => ({ stats: null, isError: false }) }))
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: () => ({ ...wrapped.current, slides: [], refetch: vi.fn() }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ getQueryData: () => undefined }),
}))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({ captureRef: { current: null }, isSharing: false, hasError: false, canShareFiles: true, share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn(), reportCaptureError: vi.fn() }),
}))

import WrappedPage from '@/app/(app)/wrapped/page'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { ShareCardSheet } from '@/components/share/share-card-sheet'
import { holdAccount } from '@/__tests__/support/account-change'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'

const WIDTHS = [320, 360, 384, 412] as const
const LOCALES = [{ locale: 'pt-BR', messages: ptBR }, { locale: 'en', messages: en }] as const
const COVER_STATES = [
  { state: 'ready', recap: createMockRecap(), isEmpty: false, isLoading: false, isError: false },
  { state: 'empty', recap: null, isEmpty: true, isLoading: false, isError: false },
  { state: 'failed', recap: null, isEmpty: false, isLoading: false, isError: true },
] as const
const COVER_CASES = COVER_STATES.flatMap((cover) => LOCALES.flatMap((locale) => WIDTHS.map((width) => ({ ...cover, ...locale, width }))))
const DIALOG_CASES = LOCALES.flatMap((locale) => WIDTHS.map((width) => ({ ...locale, width })))
const themeStyle = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')

/** Runs in the page, so it reads nothing from this module. The number of text lines inside each element, read from its text nodes. */
function measureTextLines(elements: Element[]) {
  return elements.map((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const tops = new Set<number>()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
    }
    return tops.size
  })
}

describe('the guided Wrapped cover, the share sheet and the milestone dialog in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    holdAccount('user-1')
    useEngagementPromptStore.setState({ promptedMilestoneKeys: [], lastPromptedAtIso: null, homeEntryDismissed: false, armedPrompt: null })
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function openPage(width: number, markup: string) {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    await page.setContent(`<!DOCTYPE html><html class="dark" style="${themeStyle}"><style>${stylesheet}</style><body>${markup}</body></html>`)
    await loadAppFonts(page)
    return page
  }

  it.each(COVER_CASES)('centres the $state cover block in the free area, with one line labels and 48 px targets, at $width px in $locale', async ({ width, locale, messages, state, ...cover }) => {
    wrapped.current = cover
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><WrappedPage /></NextIntlClientProvider>)
    await act(async () => {})
    expect(view.container.querySelector('[data-wrapped-cover="guided"]')).toHaveAttribute('data-state', state)
    const page = await openPage(width, view.container.innerHTML)
    try {
      const geometry = await page.evaluate(() => {
        const lines = (element: Element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
        }
        const cover = document.querySelector('[data-wrapped-cover="guided"]')!
        const scroller = cover.firstElementChild!
        const block = document.querySelector('[data-wrapped-cover-block]')!.getBoundingClientRect()
        const primary = document.querySelector('[data-wrapped-cover-primary]')?.getBoundingClientRect()
        const options = [...document.querySelectorAll('[data-option-card]')]
        return {
          free: { top: cover.getBoundingClientRect().top, bottom: primary?.top ?? cover.getBoundingClientRect().bottom },
          block: { top: block.top, bottom: block.bottom, left: block.left, right: block.right },
          scrolls: scroller.scrollHeight > scroller.clientHeight,
          documentWidth: document.documentElement.scrollWidth,
          optionLines: options.map(lines),
          optionHeights: options.map((option) => option.getBoundingClientRect().height),
          questionLines: lines(document.querySelector('h2')!),
          titleLines: lines(document.querySelector('h1')!),
          orbit: document.querySelector('[data-wrapped-cover-block] [data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state'),
        }
      })
      expect(geometry.scrolls, JSON.stringify(geometry)).toBe(false)
      expect(Math.abs((geometry.block.top + geometry.block.bottom) / 2 - (geometry.free.top + geometry.free.bottom) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.block.left + geometry.block.right) / 2 - width / 2)).toBeLessThanOrEqual(1)
      expect(geometry.documentWidth).toBeLessThanOrEqual(width)
      expect(geometry.optionLines).toEqual([1, 1, 1])
      for (const height of geometry.optionHeights) expect(height).toBeGreaterThanOrEqual(48)
      expect(geometry.questionLines).toBeLessThanOrEqual(2)
      expect(geometry.titleLines).toBeLessThanOrEqual(2)
      expect(geometry.orbit).toBe('parado')
    } finally { await page.close(); view.unmount() }
  })

  it.each(DIALOG_CASES)('keeps the share question within two lines as the sheet heading and each of the three periods on one line with a 48 px target at $width px in $locale', async ({ width, locale, messages }) => {
    wrapped.current = { recap: createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: 5, totalCompletions: 40, completionRate: 73.5 }) }), isEmpty: false, isLoading: false, isError: false }
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><ShareCardSheet onClose={vi.fn()} /></NextIntlClientProvider>)
    await act(async () => {})
    const portal = document.querySelector('.orbit-sheet-portal')!
    const page = await openPage(width, portal.outerHTML)
    try {
      await page.locator('.orbit-sheet-panel').evaluate(settleAnimations)
      const options = page.locator('[data-option-group] [data-option-card]')
      const titleLines = await page.locator('.orbit-sheet-title').evaluateAll(measureTextLines)
      expect(titleLines).toHaveLength(1)
      expect(titleLines[0]).toBeGreaterThanOrEqual(1)
      expect(titleLines[0]).toBeLessThanOrEqual(2)
      expect(await options.evaluateAll(measureTextLines)).toEqual([1, 1, 1])
      for (const height of await options.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(48)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    } finally { await page.close(); view.unmount() }
  })

  it.each(DIALOG_CASES)('centres the milestone dialog panel in the window at $width px in $locale', async ({ width, locale, messages }) => {
    vi.useFakeTimers()
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><MilestoneSharePrompt /></NextIntlClientProvider>)
    await act(async () => {
      useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7')
      await Promise.resolve()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_DELAY_MS) })
    vi.useRealTimers()
    await act(async () => {})
    const portal = document.querySelector('.orbit-sheet-portal')!
    const page = await openPage(width, portal.outerHTML)
    try {
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.orbit-sheet-panel')!.getBoundingClientRect()
        const orbit = document.querySelector('[data-milestone-share-dialog] [data-asset="orbit-mascot"]')
        return {
          panel: { top: panel.top, bottom: panel.bottom, left: panel.left, right: panel.right },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          orbit: { state: orbit?.getAttribute('data-orbit-state'), width: orbit?.getBoundingClientRect().width },
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(await page.locator('[data-slot="sheet-actions"] button').evaluateAll(measureTextLines)).toEqual([1, 1, 1])
      expect(Math.abs((geometry.panel.left + geometry.panel.right) / 2 - geometry.viewport.width / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.panel.top + geometry.panel.bottom) / 2 - geometry.viewport.height / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(geometry.panel.right - geometry.panel.left).toBeLessThanOrEqual(Math.min(width - 32, 420))
      expect(geometry.documentWidth).toBeLessThanOrEqual(width)
      expect(geometry.orbit).toEqual({ state: 'feliz', width: 96 })
    } finally { await page.close(); view.unmount() }
  })
})
