import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { useUIStore } from '@/stores/ui-store'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

describe('daily streak rendering in Chromium', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['en', 'pt-BR'] as const)('keeps the ring and final count readable in %s at narrow widths and larger text', async (locale) => {
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('daily-streak', { streak: 1000 })
    const { container, unmount } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><CelebrationPanel /></NextIntlClientProvider>)
    const markup = container.innerHTML
    unmount()
    const page = await browser.newPage()
    try {
      for (const mode of ['light', 'dark'] as const) {
        for (const width of [320, 412, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
          await page.setContent(`<style>${stylesheet}:root{${variables}font-size:200%}body{margin:0}main{padding:16px;max-width:560px}</style><main>${markup}</main>`)
          await loadAppFonts(page)
          await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 140 } })
          const sweep = await page.locator('[data-daily-streak-moment]').evaluate((panel) => ({
            stroke: getComputedStyle(panel.querySelector('circle:last-of-type')!).stroke,
            foreground: getComputedStyle(panel.querySelector('.daily-streak-number')!).color,
          }))
          expect(sweep.stroke).toBe(sweep.foreground)
          await page.evaluate(() => { for (const animation of document.getAnimations()) animation.currentTime = 1000 })
          const final = await page.locator('[data-daily-streak-moment]').evaluate((panel) => {
            const previous = panel.querySelector('[data-previous-streak]')!
            const current = previous.nextElementSibling!
            const label = panel.querySelector('p')!
            const button = panel.querySelector('button')!
            const numberRange = document.createRange()
            numberRange.selectNodeContents(current)
            const labelRange = document.createRange()
            labelRange.selectNodeContents(label)
            return {
              previousOpacity: getComputedStyle(previous).opacity,
              currentOpacity: getComputedStyle(current).opacity,
              currentText: current.textContent,
              ringOffset: getComputedStyle(panel.querySelector('circle:last-of-type')!).strokeDashoffset,
              numberFits: numberRange.getBoundingClientRect().width <= current.getBoundingClientRect().width + 1,
              labelWidth: label.getBoundingClientRect().width,
              rangeWidth: labelRange.getBoundingClientRect().width,
              labelFits: labelRange.getBoundingClientRect().width <= label.getBoundingClientRect().width + 1,
              withinViewport: panel.getBoundingClientRect().right <= innerWidth,
              closeSize: [button.getBoundingClientRect().width, button.getBoundingClientRect().height],
            }
          })
          expect(final.labelFits, JSON.stringify({ mode, width, final })).toBe(true)
          expect(final).toMatchObject({ previousOpacity: '0', currentOpacity: '1', currentText: '1000', ringOffset: '0px', numberFits: true, labelFits: true, withinViewport: true })
          expect(final.closeSize.every((size) => size >= 48)).toBe(true)
          await page.emulateMedia({ reducedMotion: 'reduce' })
          const movement = await page.locator('.daily-streak-number').evaluate((number) => getComputedStyle(number).animationName)
          expect(movement).toBe('none')
          expect(await page.locator('[data-previous-streak]').evaluate((previous) => getComputedStyle(previous).opacity)).toBe('0')
          await page.emulateMedia({ reducedMotion: 'no-preference' })
        }
      }
    } finally {
      await page.close()
    }
  })
})
