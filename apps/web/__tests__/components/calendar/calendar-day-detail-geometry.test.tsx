import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
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

  it.each([320, 360, 384, 412, 1280].flatMap((width) => [false, true].flatMap((loggable) => locales.map(({ locale, messages }) => ({ width, loggable, locale, messages })))))('fits titles and targets at $width with loggable=$loggable in $locale', async ({ width, loggable, locale, messages }) => {
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <div style={{ padding: 16 }}><CalendarDayDetail dateStr="2026-09-12" today="2026-09-12"
        entries={[{ habitId: 'habit-1', title: 'Caminhar pelo bairro depois do trabalho', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }, { habitId: 'habit-2', title: 'Ler', status: 'upcoming', isBadHabit: false, dueTime: null, isOneTime: false }]}
        calendarEvents={events} showEventSource calendarEventsState="ready" loggable={loggable} showRecurring pendingEntryStates={new Map()}
        onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} />
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
            return { text: label.textContent, lines: new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size, clipped: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth }
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
            labelMinimum: label ? Number.parseFloat(getComputedStyle(label).minHeight) : null,
            labelPadding: label ? [getComputedStyle(label).paddingTop, getComputedStyle(label).paddingLeft] : null,
            width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            eventClipped: headline.scrollHeight > headline.clientHeight || headline.scrollWidth > headline.clientWidth,
            eventHeight: headline.getBoundingClientRect().height, eventLineHeight: Number.parseFloat(getComputedStyle(headline).lineHeight),
            eventLines: new Set([...titleRange.getClientRects()].map((box) => Math.round(box.top))).size,
            labels,
            targets: [...document.querySelectorAll<HTMLElement>('button, a')].map((target) => {
              const box = target.getBoundingClientRect()
              const style = getComputedStyle(target)
              return { label: target.getAttribute('aria-label') ?? target.textContent, width: box.width, height: box.height, left: box.left, right: box.right, clipped: target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth, listRow: target.classList.contains('orbit-list-row-body'), inlinePadding: Math.min(Number.parseFloat(style.paddingInlineStart), Number.parseFloat(style.paddingInlineEnd)), blockPadding: Math.min(Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)) }
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
          expect(geometry.labelPadding).toEqual([`${12 * scale}px`, `${16 * scale}px`])
        }
        expect(geometry.scrollWidth, JSON.stringify(geometry)).toBe(geometry.width)
        expect(geometry.eventHeight).toBeLessThanOrEqual(geometry.eventLineHeight * 2 + 1)
        if (scale === 1) {
          expect(geometry.eventLines).toBeLessThanOrEqual(2)
          expect(geometry.eventClipped).toBe(false)
        }
        for (const label of geometry.labels) {
          expect(label.clipped, JSON.stringify(label)).toBe(false)
          if (scale === 1) expect(label.lines, JSON.stringify(label)).toBe(1)
        }
        for (const target of geometry.targets) {
          expect(target.width, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(target.height, JSON.stringify(target)).toBeGreaterThanOrEqual(48)
          expect(target.left).toBeGreaterThanOrEqual(16)
          expect(target.right).toBeLessThanOrEqual(width - 16)
          expect(target.clipped, JSON.stringify(target)).toBe(false)
          if (target.listRow) {
            expect(target.inlinePadding, JSON.stringify(target)).toBeGreaterThanOrEqual(8)
            expect(target.blockPadding, JSON.stringify(target)).toBeGreaterThanOrEqual(4)
          }
        }
      }
    } finally { await page.close() }
  })
})
