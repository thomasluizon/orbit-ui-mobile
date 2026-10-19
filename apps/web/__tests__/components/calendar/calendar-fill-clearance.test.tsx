import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('calendar painted fill clearance', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412].flatMap((width) => ['en', 'pt-BR'].flatMap((locale) => ['hover', 'press', 'focus'].map((state) => ({ width, locale, state })))))('clears month paint at $width in $locale while $state', async ({ width, locale, state }) => {
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
      <CalendarGrid currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-12" weekStartsOn={1} selectedDateStr="2026-09-11"
        dayMap={new Map()} onSelectDay={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet} * { transition: none !important }</style><body>${view.container.innerHTML}</body></html>`)
      const control = page.getByTestId('calendar-day-select-2026-09-12')
      if (state === 'focus') { await page.keyboard.press('Tab'); await control.focus() }
      else { await control.hover(); if (state === 'press') await page.mouse.down() }
      const geometry = await control.evaluate((element) => {
        const target = element.getBoundingClientRect()
        const circle = element.querySelector('[data-day-circle]')!.getBoundingClientRect()
        return { width: target.width, height: target.height, leading: circle.left - target.left, trailing: target.right - circle.right }
      })
      expect(geometry.width).toBeCloseTo((width - 32 - (width < 364 ? 0 : 24)) / 7, 1)
      expect(geometry.height).toBeGreaterThanOrEqual(44)
      expect(geometry.leading).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE / 2 - 0.1)
      expect(geometry.trailing).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE / 2 - 0.1)
      const result = await control.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations).toEqual([])
    } finally { await page.mouse.up(); await page.close(); view.unmount() }
  })
})
