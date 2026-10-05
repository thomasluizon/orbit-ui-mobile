import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enUS, ptBR as ptLocale } from 'date-fns/locale'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createLocaleDateFormatters } from '@orbit/shared/hooks/date-format-core'
import { CalendarTimeGrid } from '@/components/calendar/calendar-time-grid'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const date = new Date(2026, 8, 30)
const dateStr = '2026-09-30'
const longTitle = 'A very long calendar title '.repeat(12)
const entry: CalendarDayEntry = { habitId: 'first', title: longTitle, status: 'upcoming', isBadHabit: false, dueTime: '08:00', isOneTime: false }
const locales = [{ locale: 'en', messages: en, dateLocale: enUS }, { locale: 'pt-BR', messages: ptBR, dateLocale: ptLocale }]

function timeLabel(time: string) {
  const hour = Number(time.slice(0, 2))
  return `${hour % 12 || 12}:${time.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`
}


function expectNoOverlap(targets: readonly { left: number; right: number; top: number; bottom: number }[]) {
  for (const [index, target] of targets.entries()) {
    for (const other of targets.slice(index + 1)) {
      expect(target.right <= other.left || other.right <= target.left || target.bottom <= other.top || other.bottom <= target.top).toBe(true)
    }
  }
}

describe('Week and agenda geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'] as const)('fills the untimed summary hit area at radius 8 in %s', async (theme) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CalendarTimeGrid columns={[{ date, dateStr, isToday: false, isFuture: false }]}
        dayMap={new Map([[dateStr, [{ ...entry, dueTime: null }]]])} onSelectDay={vi.fn()}
        displayTime={timeLabel} dateFnsLocale={enUS} allDayLabel={en.calendar.timeGrid.noSetTime}
        nowLabel={en.calendar.timeGrid.now} timeZone="UTC" />
    </NextIntlClientProvider>)
    const page = await browser.newPage()
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', theme)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<html class="${theme}"><style>${stylesheet}\n:root{${variables}}</style>${container.innerHTML}</html>`)
      await loadAppFonts(page)
      for (const width of [412, 1280]) {
        await page.setViewportSize({ width, height: 915 })
        await page.locator('[data-testid="time-grid-all-day-summary"]').hover()
        await page.waitForFunction(() => {
          const button = document.querySelector('[data-testid="time-grid-all-day-summary"]')!
          return button.getAnimations().every((animation) => animation.playState === 'finished')
        })
        const fill = await page.locator('[data-testid="time-grid-all-day-summary"]').evaluate((button) => {
          const style = getComputedStyle(button)
          const rect = button.getBoundingClientRect()
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--bg-hover)'
          button.append(probe)
          const expected = getComputedStyle(probe).backgroundColor
          probe.remove()
          return { width: rect.width, height: rect.height, background: style.backgroundColor, expected,
            radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
            padding: [style.paddingLeft, style.paddingRight, style.paddingTop, style.paddingBottom] }
        })
        expect(fill.width).toBeGreaterThanOrEqual(48)
        expect(fill.height).toBeGreaterThanOrEqual(48)
        expect(fill.background).toBe(fill.expected)
        expect(fill.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(fill.radii).toEqual(['8px', '8px', '8px', '8px'])
        expect(fill.padding).toEqual(['8px', '8px', '8px', '8px'])
      }
    } finally { await page.close() }
  })

  it.each(locales.flatMap((settings) => [false, true].map((crowded) => ({ ...settings, crowded }))))('keeps week labels and every crowded target clear in $locale at 320 and 200% text (crowded=$crowded)', async ({ locale, messages, dateLocale, crowded }) => {
    const columns = Array.from({ length: 7 }, (_, index) => ({ date: new Date(2026, 8, 30 + index), dateStr: `day-${index}`, isToday: index === 0, isFuture: index > 0 }))
    const entries = [entry, { ...entry, habitId: 'second' }, { ...entry, habitId: 'adjacent', dueTime: '09:00' }, { ...entry, habitId: 'last', dueTime: '23:59' }, { ...entry, habitId: 'untimed', dueTime: null }]
    const dayMap = new Map(columns.map((column) => [column.dateStr, crowded ? entries : entries.filter((item) => item.habitId !== 'second')]))
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <CalendarTimeGrid columns={columns} dayMap={dayMap} onSelectDay={vi.fn()} displayTime={timeLabel} dateFnsLocale={dateLocale} allDayLabel={messages.calendar.timeGrid.noSetTime} nowLabel={messages.calendar.timeGrid.now} timeZone="UTC" />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        await page.evaluate(() => { const scroller = document.querySelector<HTMLElement>('.thin-scrollbar')!; scroller.scrollTop = 380 })
        const geometry = await page.evaluate(() => {
          const box = (node: Element) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } }
          const band = document.querySelector('[data-testid="time-grid-all-day-band"]')!
          const headers = [...document.querySelectorAll('[data-testid="time-grid-col-header"]')]
          const labels = [...document.querySelectorAll<HTMLElement>('[data-testid="time-grid-hour-label"]')]
          return { page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, band: box(band),
            headers: headers.map(box),
            labels: labels.map((label) => ({ ...box(label), parent: box(label.parentElement!), font: Number.parseFloat(getComputedStyle(label).fontSize) })),
            summaries: [...document.querySelectorAll('[data-testid="time-grid-all-day-summary"]')].map((button) => ({ ...box(button), parent: box(button.parentElement!) })),
            columns: [...document.querySelectorAll('[data-testid="time-grid-day-column"]')].map((column) => ({ ...box(column), targets: [...column.querySelectorAll('[data-testid="time-grid-event"]')].map(box) })),
          }
        })
        expect(geometry.scroll).toBe(geometry.page)
        for (const header of geometry.headers) {
          expect(header.height).toBeGreaterThanOrEqual(48)
          expect(header.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.band.top + 1)
        }
        for (const label of geometry.labels) {
          expect(label.font).toBe(12 * scale)
          expect(label.left).toBeGreaterThanOrEqual(label.parent.left)
          expect(label.right).toBeLessThanOrEqual(label.parent.right)
        }
        for (const summary of geometry.summaries) {
          expect(summary.width).toBeGreaterThanOrEqual(48)
          expect(summary.height).toBeGreaterThanOrEqual(48)
          expect(summary.right).toBeLessThanOrEqual(summary.parent.right)
        }
        for (const column of geometry.columns) {
          for (const target of column.targets) {
            expect(target.width).toBeGreaterThanOrEqual(48)
            expect(target.height).toBeGreaterThanOrEqual(48)
            expect(target.bottom).toBeLessThanOrEqual(column.bottom)
          }
          expectNoOverlap(column.targets)
        }
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(await page.locator('[data-testid="time-grid-event"]').first().evaluate((target) => Number.parseFloat(getComputedStyle(target).transitionDuration))).toBeLessThanOrEqual(0.001)
    } finally { await page.close() }
  })


  it.each(locales)('keeps the complete disclosed title reachable in $locale at 200% text', async ({ locale, messages, dateLocale }) => {
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <CalendarTimeGrid columns={[{ date, dateStr, isToday: false, isFuture: false }]} dayMap={new Map([[dateStr, [entry]]])} onSelectDay={vi.fn()} displayTime={timeLabel} dateFnsLocale={dateLocale} allDayLabel={messages.calendar.timeGrid.noSetTime} nowLabel={messages.calendar.timeGrid.now} timeZone="UTC" />
    </NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: new RegExp('A very long calendar title') }))
    const portal = document.querySelector('.orbit-sheet-portal')!
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${portal.outerHTML}`)
      await loadAppFonts(page)
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!; body.scrollTop = body.scrollHeight })
      const geometry = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const title = body.querySelector<HTMLElement>('[data-personal-text]')!
        const metadata = title.nextElementSibling!
        return { text: title.textContent, font: Number.parseFloat(getComputedStyle(title).fontSize), clamp: getComputedStyle(title).webkitLineClamp,
          overflow: title.scrollWidth > title.clientWidth, lastBottom: metadata.getBoundingClientRect().bottom, bodyBottom: body.getBoundingClientRect().bottom, scrolls: body.scrollHeight > body.clientHeight }
      })
      expect(geometry.text).toBe(longTitle)
      expect(geometry.font).toBe(34)
      expect(geometry.clamp).toBe('none')
      expect(geometry.overflow).toBe(false)
      expect(geometry.scrolls).toBe(true)
      expect(geometry.lastBottom).toBeLessThanOrEqual(geometry.bodyBottom)
    } finally { await page.close() }
  })

  it.each(locales)('bounds agenda titles with metadata below and growing rows in $locale', async ({ locale, messages }) => {
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <CalendarAgendaView startDate={date} dayMap={new Map([[dateStr, [entry]]])} displayTime={timeLabel} displayWeekdayDate={createLocaleDateFormatters(locale).displayWeekdayDate} todayKey={dateStr} isLoading={false} loadingLabel={messages.calendar.loading} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      let defaultHeight = 0
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const geometry = await page.evaluate(() => {
          const row = document.querySelector<HTMLButtonElement>('.orbit-list-row-body')!
          const title = row.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
          const metadata = title.nextElementSibling!
          const heading = document.querySelector('h2')!
          const range = document.createRange(); range.selectNodeContents(heading)
          const titleStyle = getComputedStyle(title)
          return { height: row.getBoundingClientRect().height, titleHeight: title.getBoundingClientRect().height, titleFont: Number.parseFloat(titleStyle.fontSize), lineHeight: Number.parseFloat(titleStyle.lineHeight),
            titleWidth: title.getBoundingClientRect().width, available: row.clientWidth - 32, clamp: titleStyle.webkitLineClamp,
            titleBottom: title.getBoundingClientRect().bottom, metadataTop: metadata.getBoundingClientRect().top, headingLines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
            page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }
        })
        expect(geometry.scroll).toBe(geometry.page)
        expect(geometry.titleFont).toBe(17 * scale)
        expect(geometry.clamp).toBe('2')
        expect(geometry.titleHeight).toBeLessThanOrEqual(2 * geometry.lineHeight + 1)
        expect(geometry.titleWidth).toBe(geometry.available)
        expect(geometry.metadataTop).toBeGreaterThan(geometry.titleBottom)
        expect(geometry.height).toBeGreaterThanOrEqual(48)
        if (scale === 1) { defaultHeight = geometry.height; expect(geometry.headingLines).toBe(1) }
        else expect(geometry.height).toBeGreaterThan(defaultHeight)
      }
    } finally { await page.close() }
  })
})
