import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enUS, ptBR as ptBRLocale } from 'date-fns/locale'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { buildCalendarRangeModel } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarWeekView } from '@/components/calendar/calendar-week-view'
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

  it.each([320, 412, 600, 1024, 1352].flatMap((width) => ['en', 'pt-BR'].map((locale) => ({ width, locale }))))('insets week header paint from the gutter and adjacent cells at $width in $locale', async ({ width, locale }) => {
    const words = locale === 'en' ? en : ptBR
    const columns = Array.from({ length: 7 }, (_, index) => ({ date: new Date(2026, 7, 31 + index), dateStr: index === 0 ? '2026-08-31' : `2026-09-0${index}`, isToday: index === 3, isFuture: index > 3 }))
    const dayMap = new Map(columns.map(({ dateStr }) => [dateStr, [{ habitId: dateStr, title: 'Read', dueTime: null, status: 'upcoming' as const, isBadHabit: false, isOneTime: false }]]))
    const view = render(<NextIntlClientProvider locale={locale} messages={words} timeZone="UTC">
      <div style={{ height: 640, display: 'flex', flexDirection: 'column' }}>
        <CalendarWeekView columns={columns} dayMap={dayMap} slideDirection={null} onSelectDay={vi.fn()} displayTime={(time) => time}
          dateFnsLocale={locale === 'en' ? enUS : ptBRLocale} allDayLabel={words.calendar.timeGrid.noSetTime} nowLabel={words.calendar.timeGrid.now} timeZone="UTC" />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet} * { transition: none !important }</style><body>${view.container.innerHTML}</body></html>`)
      for (const header of await page.getByTestId('time-grid-col-header').all()) {
        for (const state of ['hover', 'press', 'focus'] as const) {
          if (state === 'focus') { await page.keyboard.press('Escape'); await header.focus() }
          else { await header.hover(); if (state === 'press') await page.mouse.down() }
          const paint = await header.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
          const bounds = await header.boundingBox()
          expect(paint.hasFill).toBe(true)
          expect(paint.violations, JSON.stringify({ state, paint, bounds })).toEqual([])
          expect(await header.evaluate((element) => element.matches(':focus-visible'))).toBe(state === 'focus')
          const gaps = [paint.fill.left - bounds!.x, bounds!.x + bounds!.width - paint.fill.right, paint.fill.top - bounds!.y, bounds!.y + bounds!.height - paint.fill.bottom]
          gaps.forEach((gap) => expect(gap, JSON.stringify({ state, paint, bounds })).toBeCloseTo(INTERACTION_FILL_CLEARANCE, 1))
          const radius = await header.evaluate((element) => getComputedStyle(element).borderRadius)
          expect(Number.parseFloat(radius)).toBeGreaterThan(0)
          await page.mouse.up()
          await header.blur()
        }
      }
    } finally { await page.mouse.up(); await page.close(); view.unmount() }
  })

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
        const disc = element.querySelector('[data-day-disc]')!.getBoundingClientRect()
        return { width: target.width, height: target.height, circleWidth: circle.width, circleHeight: circle.height, discWidth: disc.width, discHeight: disc.height, leading: circle.left - target.left, trailing: target.right - circle.right }
      })
      expect(geometry.width).toBeCloseTo((width - 32 - (width < 364 ? 0 : 24)) / 7, 1)
      expect(geometry.height).toBeGreaterThanOrEqual(44)
      expect(geometry.leading).toBeGreaterThanOrEqual(-0.1)
      expect(geometry.trailing).toBeGreaterThanOrEqual(-0.1)
      expect(geometry.circleWidth).toBe(34)
      expect(geometry.circleHeight).toBeCloseTo(geometry.circleWidth, 1)
      expect(geometry.discWidth).toBe(34)
      expect(geometry.discHeight).toBe(34)
      const gaps = await page.locator('[data-day-circle]').evaluateAll(circles => circles.flatMap((circle, index) => {
        const previous = circles[index - 1]?.getBoundingClientRect()
        const bounds = circle.getBoundingClientRect()
        return previous && Math.abs(previous.top - bounds.top) < 0.5 ? [bounds.left - previous.right] : []
      }))
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8 - 0.01)
      const result = await control.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations).toEqual([])
    } finally { await page.mouse.up(); await page.close(); view.unmount() }
  })

  it.each([320, 412].flatMap((width) => ['en', 'pt-BR'].map((locale) => ({ width, locale }))))('contains read-only range paint at $width in $locale', async ({ width, locale }) => {
    const model = buildCalendarRangeModel(new Date(2026, 8, 12), new Map(), 1, '2026-09-12')
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
      <CalendarRangeView model={model} weekdayLabels={['M', 'T', 'W', 'T', 'F', 'S', 'S']} rangeLabel="Range"
        isLoading={false} loadingLabel="Loading" stats={[
          { key: 'bestStreak', value: 0, label: 'Streak' }, { key: 'totalLogs', value: 0, label: 'Logs' }, { key: 'missed', value: 0, label: 'Missed' },
        ]} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="dark" style="${variables}"><style>${stylesheet}</style><body>${view.container.innerHTML}</body></html>`)
      const days = page.getByRole('img')
      expect(await days.count()).toBe(14)
      for (const day of await days.all()) {
        const geometry = await day.evaluate((element) => {
          const target = element.getBoundingClientRect()
          const circle = element.querySelector('[data-day-circle]')!.getBoundingClientRect()
          const disc = element.querySelector('[data-day-disc]')!.getBoundingClientRect()
          return { width: target.width, height: target.height, circleWidth: circle.width, circleHeight: circle.height, discWidth: disc.width, discHeight: disc.height, leading: circle.left - target.left, trailing: target.right - circle.right }
        })
        expect(geometry.width).toBeCloseTo((width - 32 - (width < 364 ? 0 : 24)) / 7, 1)
        expect(geometry.height).toBeGreaterThanOrEqual(44)
        expect(geometry.leading).toBeGreaterThanOrEqual(-0.1)
        expect(geometry.trailing).toBeGreaterThanOrEqual(-0.1)
        expect(geometry.circleWidth).toBe(34)
        expect(geometry.circleHeight).toBeCloseTo(geometry.circleWidth, 1)
        expect(geometry.discWidth).toBe(34)
        expect(geometry.discHeight).toBe(34)
        expect((await day.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)).violations).toEqual([])
      }
    } finally { await page.close(); view.unmount() }
  })
})
