import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: true }) }) }))

function MonthContent({ loading }: Readonly<{ loading: boolean }>) {
  return <NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
    <CalendarGrid currentMonth={new Date(2026, 8, 1)} dayMap={new Map()} onSelectDay={vi.fn()} todayKey="2026-09-12" weekStartsOn={1} isLoading={loading} />
    <div data-testid="calendar-day-card-slot" style={{ paddingInline: 16, paddingTop: 24 }}>
      <CalendarDayDetail loadingLabel={loading ? ptBR.calendar.loading : undefined} dateStr="2026-09-12" today="2026-09-12"
        entries={loading ? [] : [{ habitId: 'habit-1', title: 'Ler', status: 'upcoming', isBadHabit: false, dueTime: '08:00', isOneTime: false }]}
        calendarEvents={[]} calendarEventsState="ready" loggable showRecurring pendingEntryStates={new Map()}
        onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
    </div>
    <div data-testid="figures" style={{ paddingTop: 24 }}>0</div>
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

  it.each([320, 412, 840])('keeps the grid, day card and figures stationary at %i', async (width) => {
    const view = render(<MonthContent loading />)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    const measure = () => page.evaluate(() => {
      const grid = document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect()
      const slot = document.querySelector('[data-testid="calendar-day-card-slot"]')!
      return { gridHeight: grid.height, gridTop: grid.top, dayTop: slot.getBoundingClientRect().top,
        dayHeight: slot.firstElementChild!.getBoundingClientRect().height,
        figuresTop: document.querySelector('[data-testid="figures"]')!.getBoundingClientRect().top }
    })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const loading = await measure()
      view.rerender(<MonthContent loading={false} />)
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const ready = await measure()
      expect(ready, JSON.stringify({ width, loading, ready })).toEqual(loading)
    } finally { await page.close(); view.unmount() }
  })
})
