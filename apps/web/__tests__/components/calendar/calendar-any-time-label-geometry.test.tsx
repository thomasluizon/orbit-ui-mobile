import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { enUS, ptBR as portugueseDateLocale } from 'date-fns/locale'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { buildCalendarDayMap } from '@orbit/shared/utils'
import { CalendarTimeGrid, type TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { expectLabelsFit, markRequiredLabels } from '../../../e2e/layout/label-fit-contract'

const columns: TimeGridColumn[] = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(2026, 9, 5 + index),
  dateStr: `2026-10-${String(5 + index).padStart(2, '0')}`,
  isToday: false,
  isFuture: false,
}))
const dayMap = buildCalendarDayMap({
  habits: [null, null, null, '08:00', '21:00'].map((dueTime, index) => createMockHabitScheduleItem({
    id: `label-fit-${index}`, title: `Organizar as anotações e preparar a semana ${index}`, dueTime,
    scheduledDates: columns.map((column) => column.dateStr),
  })), logs: {},
}, { from: columns[0]!.dateStr, to: columns[6]!.dateStr }, new Date(2026, 9, 8, 12))

describe('Calendar any-time gutter geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  for (const [locale, words, dateLocale] of [['en', en, enUS], ['pt-BR', ptBR, portugueseDateLocale]] as const) {
    for (const density of ['crowded', 'empty'] as const) {
      it.each([320, 360, 384, 412, 1352])(`keeps the ${locale} ${density} gutter whole at %ipx and 200% text`, async (width) => {
        const { container } = render(<NextIntlClientProvider locale={locale} messages={words} timeZone="UTC">
          <CalendarTimeGrid columns={columns} dayMap={density === 'empty' ? new Map() : dayMap} onSelectDay={vi.fn()} displayTime={(time) => time}
            dateFnsLocale={dateLocale} allDayLabel={words.calendar.timeGrid.noSetTime} nowLabel={words.calendar.timeGrid.now} timeZone="UTC" />
        </NextIntlClientProvider>)
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          await page.setContent(`<style>${stylesheet}</style><div style="display:flex;height:600px">${container.innerHTML}</div>`)
          await loadAppFonts(page)
          const label = page.getByTestId('time-grid-any-time-label')
          await markRequiredLabels(label)
          await expectLabelsFit(page, label.locator('..'))
          const initial = await label.evaluate((element) => ({ gutter: element.parentElement!.getBoundingClientRect().width, height: element.parentElement!.getBoundingClientRect().height, text: element.textContent }))
          expect(initial).toMatchObject({ gutter: 96, text: words.calendar.timeGrid.noSetTime })
          await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
          const enlarged = await label.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
            const cell = element.parentElement!.getBoundingClientRect()
            const style = getComputedStyle(element)
            return { lines: new Set(fragments.map((rect) => rect.top)).size, height: cell.height, fontSize: Number.parseFloat(style.fontSize),
              clipped: fragments.some((rect) => rect.left < cell.left || rect.right > cell.right || rect.top < cell.top || rect.bottom > cell.bottom),
              ellipsis: style.textOverflow === 'ellipsis' || Number.parseInt(style.webkitLineClamp) > 0 }
          })
          expect(enlarged.fontSize).toBe(24)
          expect(enlarged.lines).toBeGreaterThan(1)
          expect(enlarged.height).toBeGreaterThanOrEqual(64)
          if (density === 'empty') expect(enlarged.height).toBeGreaterThan(initial.height)
          expect(enlarged.clipped).toBe(false)
          expect(enlarged.ellipsis).toBe(false)
        } finally { await page.close() }
      })
    }
  }
})
