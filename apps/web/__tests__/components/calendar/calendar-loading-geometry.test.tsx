vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { calendarMonthResponseSchema } from '@orbit/shared/types/habit'
import { buildCalendarDayMap } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { DayCell } from '@/components/dates/day-cell'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { measureCalendarMonth } from '@/e2e/layout/calendar-month-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: true }) }) }))

function themeCss(mode = 'dark') {
  return `:root{${Object.entries(resolveWebThemeVariables('orange', mode === 'light' ? 'light' : 'dark')).map(([key, value]) => `${key}:${value}`).join(';')}}`
}

const selectedDate = '2026-09-04'
const month = calendarMonthResponseSchema.parse({
  habits: [makeHabitScheduleItem({ title: 'Ler', children: [], hasSubHabits: false, dueDate: selectedDate, dueTime: '08:00', scheduledDates: [selectedDate] })],
  logs: {},
})
const dayMap = buildCalendarDayMap(month, { from: selectedDate, to: selectedDate })

function MonthContent({ loading, eventsLoading = false, count = 1, locale = 'pt-BR' }: Readonly<{ loading: boolean; eventsLoading?: boolean; count?: number; locale?: string }>) {
  const messages = locale === 'en' ? en : ptBR
  const entries = Array.from({ length: count }, (_, index) => ({ ...dayMap.get(selectedDate)![0]!, habitId: `habit-${index}`, title: index === 3 ? 'Caminhar pelo bairro depois do trabalho e conversar com amigos' : `Habit ${index}` }))
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <CalendarGrid currentMonth={new Date(2026, 8, 1)} dayMap={loading ? new Map() : dayMap} onSelectDay={vi.fn()} todayKey={selectedDate} weekStartsOn={1} isLoading={loading} />
    <div data-testid="calendar-day-card-slot" style={{ paddingInline: 16, paddingTop: 24 }}>
      <CalendarDayDetail loadingLabel={loading ? ptBR.calendar.loading : undefined} dateStr={selectedDate} today={selectedDate}
        entries={entries}
        calendarEvents={[]} calendarEventsState={eventsLoading ? 'loading' : 'ready'} loggable showRecurring pendingEntryStates={new Map()}
        onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
    </div>
    <div data-testid="calendar-stats" style={{ paddingTop: 24 }}>0</div>
  </NextIntlClientProvider>
}

describe('calendar loading geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap((width) => [0, 1, 2, 4].flatMap((count) => ['en', 'pt-BR'].flatMap((locale) => ['dark', 'light'].map((mode) => ({ width, count, locale, mode }))))))('keeps $count habit rows stationary at $width in $locale $mode', async ({ width, count, locale, mode }) => {
    const view = render(<MonthContent loading count={count} locale={locale} />)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    const measure = () => page.evaluate(() => {
      const grid = document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect()
      const slot = document.querySelector('[data-testid="calendar-day-card-slot"]')!
      return { gridHeight: grid.height, gridTop: grid.top, dayTop: slot.getBoundingClientRect().top,
        dayHeight: slot.firstElementChild!.getBoundingClientRect().height,
        figuresTop: document.querySelector('[data-testid="calendar-stats"]')!.getBoundingClientRect().top }
    })
    try {
      await page.setContent(`<style>${stylesheet}${themeCss(mode)}</style>${view.container.innerHTML}`)
      await page.locator('html').evaluate((html, mode) => { html.setAttribute('class', mode) }, mode)
      await loadAppFonts(page)
      const loading = await measure()
      expect(await page.locator('[data-testid="calendar-day-skeleton"]').count()).toBe(1)
      view.rerender(<MonthContent loading={false} count={count} locale={locale} />)
      await page.setContent(`<style>${stylesheet}${themeCss(mode)}</style>${view.container.innerHTML}`)
      await page.locator('html').evaluate((html, mode) => { html.setAttribute('class', mode) }, mode)
      await loadAppFonts(page)
      const ready = await measure()
      expect(ready, JSON.stringify({ width, loading, ready })).toEqual(loading)
    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 412, 840].flatMap((width) => ['en', 'pt-BR'].map((locale) => ({ width, locale }))))('keeps pending events and empty events equal at $width in $locale', async ({ width, locale }) => {
    const view = render(<MonthContent loading={false} eventsLoading locale={locale} />)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    const measure = () => page.evaluate(() => ({
      card: document.querySelector('[data-testid="calendar-day-card-slot"]')!.firstElementChild!.getBoundingClientRect().height,
      figures: document.querySelector('[data-testid="calendar-stats"]')!.getBoundingClientRect().top,
    }))
    try {
      await page.setContent(`<style>${stylesheet}${themeCss()}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const pending = await measure()
      view.rerender(<MonthContent loading={false} locale={locale} />)
      await page.locator('body').evaluate((body, html) => { body.innerHTML = html }, view.container.innerHTML)
      expect(await measure()).toEqual(pending)
    } finally { await page.close(); view.unmount() }
  })

  it.each(['dark', 'light'])('fades the loggable well with the hover fill in %s', async (mode) => {
    const view = render(<DayCell day={4} words={en.calendar.dayCell} onPress={vi.fn()} loggable done={0} scheduled={1} />)
    const page = await browser.newPage({ viewport: { width: 1352, height: 600 } })
    try {
      await page.setContent(`<style>${stylesheet}${themeCss(mode)}</style>${view.container.innerHTML}`)
      await page.locator('html').evaluate((html, mode) => { html.setAttribute('class', mode) }, mode)
      const transition = await page.locator('.orbit-day-well').evaluate((well) => {
        const style = getComputedStyle(well)
        const fill = getComputedStyle(well.querySelector('[data-press-fill]')!)
        return { property: style.transitionProperty, duration: style.transitionDuration, easing: style.transitionTimingFunction,
          fillDuration: fill.transitionDuration, fillEasing: fill.transitionTimingFunction }
      })
      expect(transition.property).toBe('background-color')
      expect(transition.duration).toBe(transition.fillDuration)
      expect(transition.duration).toBe('0.24s')
      expect(transition.easing).toBe(transition.fillEasing)
      const restingAlpha = await page.locator('.orbit-day-well').evaluate((well) => {
        const channels = getComputedStyle(well).backgroundColor.match(/[\d.]+/g)!.map(Number)
        return channels.length === 4 ? channels[3]! : 1
      })
      expect(restingAlpha).toBeGreaterThan(0)
      const samples = async () => page.locator('.orbit-day-well').evaluate(async (well, restingAlpha) => {
        const fill = well.querySelector('[data-press-fill]')!
        const animations = [...well.getAnimations(), ...fill.getAnimations()]
        animations.forEach((animation) => animation.pause())
        return [0, 60, 120, 180, 240].map((time) => {
          animations.forEach((animation) => { animation.currentTime = time })
          const color = getComputedStyle(well).backgroundColor
          const channels = color.match(/[\d.]+/g)!.map(Number)
          return (channels.length === 4 ? channels[3]! : 1) / restingAlpha + Number(getComputedStyle(fill).opacity)
        })
      }, restingAlpha)
      await page.locator('.orbit-day-target').hover()
      for (const coverage of await samples()) expect(coverage).toBeGreaterThanOrEqual(1 - 1 / (255 * restingAlpha))
      await page.mouse.move(1300, 500)
      for (const coverage of await samples()) expect(coverage).toBeGreaterThanOrEqual(1 - 1 / (255 * restingAlpha))
      await page.locator('.orbit-day-target').hover()
      await page.mouse.down()
      expect(await page.locator('.orbit-day-well').evaluate((well) => getComputedStyle(well).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      await page.mouse.up()

    } finally { await page.close(); view.unmount() }
  })

  it.each([320, 412, 840])('waits for delayed events before the month baseline at %i under CPU load', async (width) => {
    const view = render(<MonthContent loading eventsLoading />)
    await act(async () => {})
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      const session = await page.context().newCDPSession(page)
      await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
      await page.setContent(`<style>${stylesheet}${themeCss()}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const pendingBaseline = measureCalendarMonth(page, ptBR.calendar.dayDetail.noEventsToImport)
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await act(async () => { view.rerender(<MonthContent loading />) })
      await page.locator('body').evaluate((body, html) => { body.innerHTML = html }, view.container.innerHTML)
      const loading = await pendingBaseline
      expect(await page.getByTestId('calendar-day-skeleton').count()).toBe(1)
      await act(async () => { view.rerender(<MonthContent loading={false} />) })
      await page.locator('body').evaluate((body, html) => { body.innerHTML = html }, view.container.innerHTML)
      const ready = await measureCalendarMonth(page, ptBR.calendar.dayDetail.noEventsToImport)
      expect(await page.getByTestId('calendar-day-skeleton').count()).toBe(0)
      expect(ready, JSON.stringify({ width, loading, ready })).toEqual(loading)
    } finally { await page.close(); view.unmount() }
  })

  it('waits for consecutive stable frames after the events content is ready', async () => {
    const view = render(<MonthContent loading={false} />)
    await act(async () => {})
    const page = await browser.newPage({ viewport: { width: 840, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}${themeCss()}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const before = await measureCalendarMonth(page, ptBR.calendar.dayDetail.noEventsToImport)
      await page.evaluate(() => {
        let frame = 0
        const shift = () => {
          document.querySelector<HTMLElement>('[data-testid="calendar-stats"]')!.style.marginTop = `${(++frame % 2) * 16}px`
          if (frame < 3) requestAnimationFrame(shift)
        }
        requestAnimationFrame(shift)
      })
      expect(await measureCalendarMonth(page, ptBR.calendar.dayDetail.noEventsToImport)).toEqual({ ...before, figuresTop: before.figuresTop + 16 })
    } finally { await page.close(); view.unmount() }
  })
})
