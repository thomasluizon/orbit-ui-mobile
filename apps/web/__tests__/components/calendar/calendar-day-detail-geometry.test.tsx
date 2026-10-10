import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { calendarDayCardDate, makeCalendarDayCardEntries } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { CheckRow } from '@/components/ui/check-row'
import type { CalendarSyncEvent } from '@orbit/shared'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: true }) }) }))

const locales = [{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }]

const events: CalendarSyncEvent[] = Array.from({ length: 21 }, (_, index) => ({
  id: `event-${index}`, title: index === 0 ? '1:1 FutureProofing Engineering' : `Evento ${index}`,
  description: null, startDate: '2026-09-12', startTime: '09:00', endTime: null,
  isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Trabalho',
}))

function expectWholeLabels(labels: { text: string | null; besideIcon: boolean | null; lines: number; clipped: boolean }[], scale: number) {
  for (const label of labels) {
    expect(label.clipped, JSON.stringify(label)).toBe(false)
    if (scale !== 1) continue
    expect(label.lines, JSON.stringify(label)).toBe(1)
    if (label.besideIcon !== null) expect(label.besideIcon, JSON.stringify(label)).toBe(true)
  }
}

describe('day card compact geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1352].flatMap((width) => [false, true].flatMap((loggable) => locales.map(({ locale, messages }) => ({ width, loggable, locale, messages })))))('keeps every habit row at the drawn floor at $width with loggable=$loggable in $locale', async ({ width, loggable, locale, messages }) => {
    const entries = makeCalendarDayCardEntries()
    expect(entries.map((entry) => entry.habitId)).toEqual(['parent-0', 'parent-1', 'parent-2', 'child-0', 'child-1'])
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ padding: 16, maxWidth: 740 }}><CalendarDayDetail dateStr={calendarDayCardDate} today={calendarDayCardDate}
        entries={entries} calendarEvents={[]} calendarEventsState="ready" loggable={loggable} showRecurring pendingEntryStates={new Map()}
        onOpenHabitTitle={vi.fn()} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
      </div>
      <CheckRow label="Family calendar" textMode="personal" onOpenLabel={vi.fn()} checked={false} onChange={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const heights: number[][] = []
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('section [data-personal-text]')].map((title) => {
          const button = title.closest('button')!
          const row = button.closest('[data-slot="list-row-body"]') ?? button
          const metadata = title.nextElementSibling as HTMLElement | null
          const titleBox = title.getBoundingClientRect()
          const rowBox = row.getBoundingClientRect()
          const metadataBox = metadata?.getBoundingClientRect()
          return { height: rowBox.height, labelHeight: button.getBoundingClientRect().height, minimum: Number.parseFloat(getComputedStyle(row).minHeight), title: title.textContent, metadata: metadata?.textContent, metadataSize: metadata ? Number.parseFloat(getComputedStyle(metadata).fontSize) : null, gap: metadataBox ? metadataBox.top - titleBox.bottom : null, contained: metadataBox ? metadataBox.bottom <= rowBox.bottom && metadataBox.left >= rowBox.left && metadataBox.right <= rowBox.right : false, clipped: metadata ? metadata.scrollHeight > metadata.clientHeight || metadata.scrollWidth > metadata.clientWidth : true }
        }))
        expect(rows).toHaveLength(entries.length)
        rows.forEach((row) => {
          expect(row.minimum, JSON.stringify(row)).toBe(68)
          expect(row.height, JSON.stringify(row)).toBeGreaterThanOrEqual(68)
          expect(row.labelHeight, JSON.stringify(row)).toBeGreaterThanOrEqual(68)
        })
        rows.forEach((row, index) => {
          expect(row.metadata).toBe(entries[index]!.dueTime ?? messages.calendar.timeGrid.noSetTime)
          expect(row.metadataSize).toBe(12 * scale)
          expect(row.gap).toBeCloseTo(4)
          expect(row.contained).toBe(true)
          expect(row.clipped).toBe(false)
        })
        heights.push(rows.map((row) => row.height))
      }
      for (const index of [0, 1, 3, 4]) {
        expect(heights[0]![index]).toBeCloseTo(68)
        expect(heights[1]![index]).toBeGreaterThan(heights[0]![index]!)
      }
      const calendarRow = page.getByRole('button', { name: 'Family calendar', exact: true })
      expect(await calendarRow.evaluate((button) => getComputedStyle(button.closest('[data-slot="list-row-body"]')!).minHeight)).toBe('52px')
    } finally { await page.close() }
  })

  it.each([320, 360, 384, 412, 1280].flatMap((width) => [false, true].flatMap((loggable) => locales.map(({ locale, messages }) => ({ width, loggable, locale, messages })))))('fits titles and targets at $width with loggable=$loggable in $locale', async ({ width, loggable, locale, messages }) => {
    const openTitle = vi.fn()
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ padding: 16 }}><CalendarDayDetail dateStr="2026-09-12" today="2026-09-12"
        entries={[{ habitId: 'habit-1', title: 'Caminhar pelo bairro depois do trabalho', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }, { habitId: 'habit-2', title: 'Ler', status: 'upcoming', isBadHabit: false, dueTime: null, isOneTime: false }]}
        calendarEvents={events} showEventSource calendarEventsState="ready" loggable={loggable} showRecurring pendingEntryStates={new Map()}
        onOpenHabitTitle={openTitle} onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
      </div>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 1800 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const geometry = await page.evaluate(() => {
          const headline = [...document.querySelectorAll<HTMLElement>('span')].find((span) => span.textContent === '1:1 FutureProofing Engineering')!
          const titleRange = document.createRange()
          titleRange.selectNodeContents(headline)
          const card = document.querySelector('section')!
          const cardBox = card.getBoundingClientRect()
          const groups = [...card.firstElementChild!.children] as HTMLElement[]
          const title = card.querySelector('h2')!
          const summary = title.nextElementSibling!
          const summaryStyle = getComputedStyle(summary)
          const label = card.querySelector<HTMLButtonElement>('button[aria-label="Caminhar pelo bairro depois do trabalho"]')
          const dayRows = [...groups[1]!.children] as HTMLElement[]
          const labels = [...document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')].map((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            const icon = label.closest('a')?.querySelector('svg')?.getBoundingClientRect()
            const box = label.getBoundingClientRect()
            return { text: label.textContent, besideIcon: icon ? box.left >= icon.right && box.top < icon.bottom && box.bottom > icon.top : null, lines: new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size, clipped: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth }
          })
          return {
            cardPadding: [getComputedStyle(card).paddingTop, getComputedStyle(card).paddingRight, getComputedStyle(card).paddingBottom, getComputedStyle(card).paddingLeft],
            titleInset: { left: title.getBoundingClientRect().left - cardBox.left, top: title.getBoundingClientRect().top - cardBox.top },
            summaryGap: summary.getBoundingClientRect().top - title.getBoundingClientRect().bottom,
            summaryFont: summaryStyle.fontFamily,
            summarySize: Number.parseFloat(summaryStyle.fontSize),
            groupGaps: groups.slice(1).map((group, index) => group.getBoundingClientRect().top - groups[index]!.getBoundingClientRect().bottom),
            bottomInset: cardBox.bottom - groups.at(-1)!.getBoundingClientRect().bottom,
            rowInsets: [...card.querySelectorAll<HTMLElement>('button:not([role="checkbox"]), a')].map((target) => {
              const fill = target.parentElement?.parentElement === groups[1] ? target.parentElement! : target
              const box = fill.getBoundingClientRect()
              return [box.left - cardBox.left, cardBox.right - box.right]
            }),
            dayGap: dayRows[1]!.getBoundingClientRect().top - dayRows[0]!.getBoundingClientRect().bottom,
            labelMinimum: label ? Number.parseFloat(getComputedStyle(label.closest('[data-slot="list-row-body"]')!).minHeight) : null,
            labelPadding: label ? [getComputedStyle(label.closest('[data-slot="list-row-body"]')!).paddingTop, getComputedStyle(label.closest('[data-slot="list-row-body"]')!).paddingLeft] : null,
            width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            eventClipped: headline.scrollHeight > headline.clientHeight || headline.scrollWidth > headline.clientWidth,
            eventHeight: headline.getBoundingClientRect().height, eventLineHeight: Number.parseFloat(getComputedStyle(headline).lineHeight),
            eventLines: new Set([...titleRange.getClientRects()].map((box) => Math.round(box.top))).size,
            labels,
            targets: [...document.querySelectorAll<HTMLElement>('button, a')].map((target) => {
              const box = (target.querySelector('[data-press-fill]') ?? target).getBoundingClientRect()
              const style = getComputedStyle(target)
              return { personalTitle: target.querySelector('[data-personal-text]')?.getAttribute('aria-label'), label: target.getAttribute('aria-label') ?? target.textContent, width: box.width, height: box.height, left: box.left, right: box.right, clipped: [...target.querySelectorAll<HTMLElement>('[data-personal-text], [data-slot="list-row-title"]')].some((label) => label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth), listRow: target.classList.contains('orbit-list-row-body'), inlinePadding: Math.min(Number.parseFloat(style.paddingInlineStart), Number.parseFloat(style.paddingInlineEnd)), blockPadding: Math.min(Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)) }
            }),
          }
        })
        expect(geometry.cardPadding).toEqual(['24px', '24px', '24px', '24px'])
        expect(geometry.titleInset).toEqual({ left: 24, top: 24 })
        expect(geometry.summaryGap).toBeCloseTo(4)
        expect(geometry.summaryFont).toContain('Geist Mono')
        expect(geometry.summarySize).toBe(12 * scale)
        expect(geometry.bottomInset).toBeCloseTo(24)
        geometry.groupGaps.forEach((gap) => expect(gap).toBeCloseTo(16))
        geometry.rowInsets.forEach((insets) => expect(insets).toEqual([24, 24]))
        expect(geometry.dayGap).toBeCloseTo(0)
        if (loggable) {
          expect(geometry.labelMinimum).toBeGreaterThanOrEqual(68)
          expect(geometry.labelPadding).toEqual(['12px', '16px'])
        }
        expect(geometry.scrollWidth, JSON.stringify(geometry)).toBe(geometry.width)
        expect(geometry.eventHeight).toBeLessThanOrEqual(geometry.eventLineHeight * 2 + 1)
        if (scale === 1) {
          expect(geometry.eventLines).toBeLessThanOrEqual(2)
          expect(geometry.eventClipped).toBe(false)
        }
        expectWholeLabels(geometry.labels, scale)
        for (const target of geometry.targets) {
          expect(target.width, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(target.height, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(target.left).toBeGreaterThanOrEqual(16)
          expect(target.right).toBeLessThanOrEqual(width - 16)
          if (target.clipped) {
            expect(target.personalTitle, JSON.stringify(target)).toBeTruthy()
            expect(target.label, JSON.stringify(target)).toContain(target.personalTitle)
          }
          if (target.listRow) {
            expect(target.inlinePadding, JSON.stringify(target)).toBeGreaterThanOrEqual(8)
            expect(target.blockPadding, JSON.stringify(target)).toBeGreaterThanOrEqual(4)
          }
        }
      }
      fireEvent.click(container.querySelector('button[aria-label^="Caminhar pelo bairro"]')!)
      expect(openTitle).toHaveBeenCalledExactlyOnceWith('Caminhar pelo bairro depois do trabalho')
    } finally { await page.close() }
  })
})
