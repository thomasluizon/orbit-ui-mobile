import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { CalendarSyncEvent } from '@orbit/shared'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true, uses24HourClock: true }) }) }))

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

  it.each([320, 360].flatMap((width) => [false, true].map((loggable) => ({ width, loggable }))))('fits titles and targets at $width with loggable=$loggable', async ({ width, loggable }) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <div style={{ padding: 16 }}><CalendarDayDetail dateStr="2026-09-12" today="2026-09-12"
        entries={[{ habitId: 'habit-1', title: 'Caminhar no parque', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }]}
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
          const labels = [...document.querySelectorAll<HTMLElement>('[data-slot="list-row-title"]')].map((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            return { text: label.textContent, lines: new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size, clipped: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth }
          })
          return {
            width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            eventClipped: headline.scrollHeight > headline.clientHeight || headline.scrollWidth > headline.clientWidth,
            eventHeight: headline.getBoundingClientRect().height, eventLineHeight: Number.parseFloat(getComputedStyle(headline).lineHeight),
            eventLines: new Set([...titleRange.getClientRects()].map((box) => Math.round(box.top))).size,
            labels,
            targets: [...document.querySelectorAll<HTMLElement>('button, a')].map((target) => {
              const box = target.getBoundingClientRect()
              return { label: target.getAttribute('aria-label') ?? target.textContent, width: box.width, height: box.height, left: box.left, right: box.right, clipped: target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth }
            }),
          }
        })
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
        }
      }
    } finally { await page.close() }
  })
})
