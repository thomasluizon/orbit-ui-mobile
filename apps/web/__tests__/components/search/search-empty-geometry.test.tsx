import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { SearchEmpty } from '@/components/search/search-results'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [412, 1280].flatMap((width) => ([['en', en], ['pt-BR', ptBr]] as const).flatMap(([locale, messages]) =>
  (['clear', 'create'] as const).map((action) => ({ width, locale, messages, action }))))

describe('Habit search empty state icon action in Chromium', () => {
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

  it.each(cases)('centres the $action glyph and puts it on the text column at $width px in $locale', async ({ width, locale, messages, action }) => {
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <SearchEmpty query="indinero" onCreate={() => {}} onClearSearch={action === 'clear' ? () => {} : undefined} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0;padding:0 16px">${view.container.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const box = (element: Element) => {
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
        }
        const button = document.querySelector('button')!
        const [title, body] = [...document.querySelectorAll('p')]
        return {
          title: box(title!),
          body: box(body!),
          button: box(button),
          glyph: box(button.querySelector('svg')!),
          hitExtension: Number.parseFloat(getComputedStyle(button, '::after').left),
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      const detail = JSON.stringify(geometry)
      const centre = (box: { left: number; right: number; top: number; bottom: number }) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 })
      expect(geometry.button.right - geometry.button.left, detail).toBe(44)
      expect(geometry.button.right - geometry.button.left - 2 * geometry.hitExtension, detail).toBe(48)
      expect(Math.abs(centre(geometry.glyph).x - centre(geometry.button).x), detail).toBeLessThanOrEqual(0.5)
      expect(Math.abs(centre(geometry.glyph).y - centre(geometry.button).y), detail).toBeLessThanOrEqual(0.5)
      expect(Math.abs(geometry.body.left - geometry.title.left), detail).toBeLessThanOrEqual(0.5)
      expect(Math.abs(geometry.glyph.left - geometry.title.left), detail).toBeLessThanOrEqual(0.5)
      expect(geometry.button.left + geometry.hitExtension, detail).toBeGreaterThanOrEqual(0)
      expect(geometry.documentWidth, detail).toBe(width)
    } finally { await page.close(); view.unmount() }
  })
})
