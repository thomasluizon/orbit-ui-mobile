import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { useUIStore } from '@/stores/ui-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = (['en', 'pt-BR'] as const).flatMap((locale) => [1, 10, 100, 1000].map((streak) => ({ locale, streak })))

describe('daily streak static and numeral geometry in Chromium', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('reserves both figures for $streak in $locale, including 200% text', async ({ locale, streak }) => {
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('daily-streak', { streak })
    const { container, unmount } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><CelebrationPanel /></NextIntlClientProvider>)
    const markup = container.innerHTML
    unmount()
    const page = await browser.newPage()
    try {
      for (const mode of ['light', 'dark'] as const) {
        for (const width of [320, 412, 1440]) {
          for (const scale of [1, 2]) {
            await page.setViewportSize({ width, height: 900 })
            const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
            await page.setContent(`<style>${stylesheet}:root{${variables}font-size:${scale * 100}%}body{margin:0}main{padding:16px;max-width:560px}</style><main>${markup}</main>`)
            await loadAppFonts(page)
            await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 140 } })
            const clipWidth = await page.locator('.daily-streak-clip').evaluate((clip) => clip.getBoundingClientRect().width)
            await page.evaluate(() => { for (const animation of document.getAnimations()) animation.currentTime = 1000 })
            const final = await page.locator('[data-daily-streak-moment]').evaluate((panel) => {
              const previous = panel.querySelector('.daily-streak-previous')!
              const current = panel.querySelector('[data-current-streak]')!
              const ring = panel.querySelector('circle:last-of-type')!
              const mark = panel.querySelector('[data-asset="orbit-mark-16"]')!
              const button = panel.querySelector('button')!
              const clip = current.parentElement!
              const text = document.createRange()
              text.selectNodeContents(current)
              const bounds = text.getBoundingClientRect()
              const close = button.getBoundingClientRect()
              return {
                previousOpacity: getComputedStyle(previous).opacity,
                currentOpacity: getComputedStyle(current).opacity, currentText: current.textContent,
                neutral: getComputedStyle(ring).stroke === getComputedStyle(current).color,
                ringOffset: getComputedStyle(ring).strokeDashoffset,
                numberFits: bounds.width <= clip.getBoundingClientRect().width + 1,
                noCloseOverlap: bounds.right <= close.left || bounds.bottom <= close.top || bounds.top >= close.bottom,
                withinViewport: panel.getBoundingClientRect().right <= innerWidth,
                clipWidth: clip.getBoundingClientRect().width,
                markSize: [mark.getBoundingClientRect().width, mark.getBoundingClientRect().height],
                closeSize: [close.width, close.height],
              }
            })
            expect(final, JSON.stringify({ mode, width, scale, final })).toMatchObject({ previousOpacity: '0', currentOpacity: '1',
              currentText: new Intl.NumberFormat(locale).format(streak), neutral: true, ringOffset: '0px', numberFits: true,
              noCloseOverlap: true, withinViewport: true, markSize: [16, 16], clipWidth })
            expect(final.closeSize.every((size) => size >= 48)).toBe(true)
            await page.emulateMedia({ reducedMotion: 'reduce' })
            expect(await page.locator('.daily-streak-number').evaluate((number) => getComputedStyle(number).animationName)).toBe('none')
            expect(await page.locator('.daily-streak-previous').evaluate((previous) => getComputedStyle(previous).opacity)).toBe('0')
            await page.emulateMedia({ reducedMotion: 'no-preference' })
          }
        }
      }
    } finally { await page.close() }
  })
})
