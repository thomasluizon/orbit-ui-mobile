import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { habitRankingCardSchema } from '@orbit/shared/types/chat'
import { habitRankingCardFixture } from '@orbit/shared/test-support/chat-fixtures'
import { HabitRankingCard } from '@/components/chat/habit-ranking-card'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const card = habitRankingCardSchema.parse(habitRankingCardFixture)
card.ranking.rows[0]!.name = 'A very long habit name with an uninterruptedwordthatmuststayreadableinthedestination'
card.ranking.rows[0]!.completedCount = 2147483647
vi.mock('@/hooks/use-habit-ranking', () => ({ useHabitRanking: (definition: typeof card) => ({
  ranking: definition.ranking, rows: definition.ranking.rows, pending: null, status: null, active: true, startsAtBeginning: true,
  showMore: vi.fn(), refresh: vi.fn(), open: vi.fn(),
}) }))

describe('habit ranking text and targets in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30000)
  const cases = [320, 360, 384, 412, 1440].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].flatMap(scale => ['light', 'dark'].map(mode => ({ width, locale, scale, mode })))))
  it.each(cases)('keeps counts, dates and actions readable at $width in $locale, $mode and $scale text', async ({ width, locale, scale, mode }) => {
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><HabitRankingCard habitRanking={card} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<html class="${mode}"><style>${stylesheet}html{font-size:${scale * 16}px}</style><main style="width:calc(100% - 32px);max-width:740px;margin:16px auto">${view.container.innerHTML}</main></html>`)
      await loadAppFonts(page)
      const measured = await page.evaluate(() => {
        const main = document.querySelector('main')!
        return {
          width: main.clientWidth, scroll: main.scrollWidth,
          buttons: [...main.querySelectorAll('button')].map(button => {
            const rect = button.getBoundingClientRect()
            const pseudo = getComputedStyle(button, '::after')
            const inset = pseudo.content === 'none' ? 0 : Math.min(0, Number.parseFloat(pseudo.top) || 0)
            return { label: button.getAttribute('aria-label') ?? button.textContent, width: rect.width - inset * 2, height: rect.height - inset * 2, left: rect.left, right: rect.right }
          }),
          counts: [...main.querySelectorAll('[data-habit-block-meta]')].map(element => ({ text: element.textContent, scroll: element.scrollWidth, width: element.clientWidth, overflow: getComputedStyle(element).textOverflow })),
        }
      })
      expect(measured.scroll).toBeLessThanOrEqual(measured.width + 1)
      expect(measured.counts).toHaveLength(2)
      expect(measured.counts[0]!.text).toContain(locale === 'en' ? '2,147,483,647' : '2.147.483.647')
      for (const count of measured.counts) {
        expect(count.scroll).toBeLessThanOrEqual(count.width + 1)
        expect(count.overflow).not.toBe('ellipsis')
      }
      for (const target of measured.buttons) {
        expect(target.width, target.label).toBeGreaterThanOrEqual(48)
        expect(target.height, target.label).toBeGreaterThanOrEqual(48)
        expect(target.left).toBeGreaterThanOrEqual(0)
        expect(target.right).toBeLessThanOrEqual(width)
      }
    } finally { await page.close(); view.unmount() }
  })
})
