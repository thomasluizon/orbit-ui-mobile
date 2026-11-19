import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'
import { HabitDetailResultDialog, type HabitDetailResult } from '@/components/habits/habit-detail-result'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const widths = [320, 360, 384, 412] as const
const locales = ['pt-BR', 'en'] as const
const results: HabitDetailResult[] = [{ kind: 'rescheduled', date: '20 de novembro' }, { kind: 'deleted' }]
const dialogCases = widths.flatMap((width) => locales.flatMap((locale) => results.map((result) => ({ width, locale, result }))))
const errorCases = widths.flatMap((width) => locales.map((locale) => ({ width, locale })))

function LoadError() {
  const t = useTranslations()
  return <div data-free-area="" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
    <HabitDetailLoadError message={t('habits.detail.loadError')} retryLabel={t('habits.detail.retry')} onRetry={vi.fn()} />
  </div>
}

describe('habit detail centred blocks in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(() => { cleanup(); resetTestFlags(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function measure(width: number, selector: string, freeSelector?: string) {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height: 780 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0">${document.body.innerHTML}</body></html>`)
      return await page.evaluate(([blockSelector, areaSelector]) => {
        const block = document.querySelector(blockSelector!)!.getBoundingClientRect()
        const area = areaSelector ? document.querySelector(areaSelector)!.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
        return { block: { top: block.top, bottom: block.bottom, left: block.left, right: block.right }, area: { top: area.top, bottom: area.bottom, left: area.left, right: area.right } }
      }, [selector, freeSelector] as const)
    } finally { await page.close() }
  }

  it.each(dialogCases)('centres the result dialog at $width px in $locale', async ({ width, locale, result }) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <HabitDetailResultDialog result={result} onSeeToday={vi.fn()} onClose={vi.fn()} />
    </NextIntlClientProvider>)
    await screen.findByRole('dialog')
    const geometry = await measure(width, '[role="dialog"]')
    expect(Math.abs((geometry.block.top + geometry.block.bottom) / 2 - (geometry.area.top + geometry.area.bottom) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(Math.abs((geometry.block.left + geometry.block.right) / 2 - (geometry.area.left + geometry.area.right) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    view.unmount()
  })

  it.each(errorCases)('centres the full-surface load error with Orbit in Parado at $width px in $locale', async ({ width, locale }) => {
    enableTestFlags('orbit_guided_flows')
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(query.match(/min-width: (\d+)px/)?.[1]), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><LoadError /></NextIntlClientProvider>)
    await screen.findByRole('alert')
    const geometry = await measure(width, '[data-habit-detail-load-error]', '[data-shell-centred-region]')
    expect(geometry.area.bottom - geometry.area.top).toBeGreaterThan(geometry.block.bottom - geometry.block.top)
    expect(Math.abs((geometry.block.top + geometry.block.bottom) / 2 - (geometry.area.top + geometry.area.bottom) / 2), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    view.unmount()
  })
})
