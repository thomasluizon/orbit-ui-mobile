import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { ShareCardSheet } from '@/components/share/share-card-sheet'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: () => ({ recap: createMockRecap({ metrics: createMockRetrospectiveMetrics({ completionRate: 100 }) }), isLoading: false, isError: false }) }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ captureRef: { current: null }, isSharing: false, hasError: false, canShareFiles: true }) }))

describe('Share progress sheet geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 384, 412, 1440].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('fits the real sheet period selector at $width in $locale', async ({ width, locale }) => {
    render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><ShareCardSheet onClose={vi.fn()} /></NextIntlClientProvider>)
    const dialog = screen.getByRole('dialog')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="orbit-sheet-viewport">${dialog.outerHTML}</div>`)
      await loadAppFonts(page)
      const geometry = await page.locator('[role="radiogroup"]').evaluate((group) => {
        const bounds = group.getBoundingClientRect()
        const column = group.parentElement!.getBoundingClientRect()
        const segments = [...group.querySelectorAll('[role="radio"]')].map((segment) => {
          const box = segment.getBoundingClientRect()
          const label = segment.querySelector('span')!
          const range = document.createRange()
          range.selectNodeContents(label)
          return {
            width: box.width, height: box.height, top: box.top,
            lines: new Set([...range.getClientRects()].map((fragment) => Math.round(fragment.top))).size,
            fits: range.getBoundingClientRect().width <= label.getBoundingClientRect().width + 1,
            contained: box.left >= bounds.left && box.right <= bounds.right,
            ellipsis: getComputedStyle(label).textOverflow === 'ellipsis',
          }
        })
        return { width: bounds.width, columnWidth: column.width, segments }
      })
      expect(geometry.width).toBeGreaterThan(0)
      expect(geometry.width).toBeCloseTo(geometry.columnWidth, 0)
      expect(geometry.segments).toHaveLength(3)
      expect(new Set(geometry.segments.map((segment) => segment.top)).size).toBe(1)
      for (const segment of geometry.segments) {
        expect(segment.width).toBeGreaterThanOrEqual(48)
        expect(segment.height).toBeGreaterThanOrEqual(48)
        expect(segment.lines).toBe(1)
        expect(segment.fits).toBe(true)
        expect(segment.contained).toBe(true)
        expect(segment.ellipsis).toBe(false)
      }
      const figure = await page.locator('[data-testid="share-card-figure"]').first().evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const bounds = element.getBoundingClientRect()
        return {
          value: element.textContent,
          fontSize: getComputedStyle(element).fontSize,
          lines: new Set([...range.getClientRects()].map((fragment) => Math.round(fragment.top))).size,
          fits: range.getBoundingClientRect().left >= bounds.left && range.getBoundingClientRect().right <= bounds.right,
        }
      })
      expect(figure).toEqual({ value: '100%', fontSize: '88px', lines: 1, fits: true })
    } finally { await page.close() }
  })
})
