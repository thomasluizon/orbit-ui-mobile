import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarImportResult } from '@/app/(app)/calendar/_components/calendar-import-result'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const cases = ([320, 360, 384, 412] as const).flatMap((width) => (['pt-BR', 'en'] as const).map((locale) => ({ width, locale })))

describe('Calendário import result dialog centring in Chromium', () => {
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

  it.each(cases)('centres the panel after an import at $width px in $locale', async ({ width, locale }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <CalendarImportResult count={3} onClose={vi.fn()} />
    </NextIntlClientProvider>)
    await screen.findByRole('dialog')
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 780 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
        return { top: panel.top, bottom: panel.bottom, left: panel.left, right: panel.right, viewport: { width: window.innerWidth, height: window.innerHeight } }
      })
      expect(Math.abs((geometry.top + geometry.bottom) / 2 - geometry.viewport.height / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.left + geometry.right) / 2 - geometry.viewport.width / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close(); view.unmount(); vi.unstubAllGlobals() }
  })
})
