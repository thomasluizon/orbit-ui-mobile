import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { format } from 'date-fns'
import { ptBR as dateLocale } from 'date-fns/locale'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarHeader, CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { buildCalendarRangeModel, formatCalendarWeekLabel } from '@orbit/shared/utils'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { Menu } from '@/components/ui/menu'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))

function seededDayMap(prefix: string) {
  const completed: CalendarDayEntry = { habitId: 'walk', title: 'Caminhar', status: 'completed', isBadHabit: false, dueTime: null, isOneTime: false }
  const missed: CalendarDayEntry = { ...completed, habitId: 'read', title: 'Ler', status: 'missed' }
  return new Map([[`${prefix}-02`, [completed]], [`${prefix}-03`, [completed, missed]], [`${prefix}-04`, [missed]]])
}

const options = [
  { value: 'month', label: ptBR.calendar.view.month },
  { value: 'week', label: ptBR.calendar.view.week },
  { value: 'range', label: ptBR.calendar.view.range },
  { value: 'agenda', label: ptBR.calendar.view.agenda },
] as const

describe('Calendar header geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 360, 412])('keeps the full recurring menu label readable at %ipx and 200% text', async (width) => {
    render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <Menu open presentation="sheet" title={ptBR.calendar.options}
        items={[{ id: 'recurring', label: ptBR.calendar.showRecurring, checked: true }]} />
    </NextIntlClientProvider>)
    const dialog = document.querySelector('[role="dialog"]')!
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      await loadAppFonts(page)
      for (const textScale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, textScale)
        const geometry = await page.evaluate(() => {
          const row = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]')!
          const label = row.querySelector<HTMLElement>('.orbit-menu-label')!
          const check = row.querySelector('svg')!
          const range = document.createRange()
          range.selectNodeContents(label)
          const lines = [...range.getClientRects()]
          const style = getComputedStyle(label)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          return {
            label: label.textContent,
            lines: new Set(lines.map((bounds) => Math.round(bounds.top))).size,
            textWidth: context.measureText(label.textContent!).width,
            availableWidth: label.getBoundingClientRect().width,
            height: row.getBoundingClientRect().height,
            checkTop: check.getBoundingClientRect().top,
            firstLineTop: lines[0]!.top,
            lineHeight: Number.parseFloat(style.lineHeight),
            fontSize: Number.parseFloat(style.fontSize),
            overflow: label.scrollWidth > label.clientWidth,
          }
        })
        expect(geometry.label).toBe('Mostrar hábitos que se repetem')
        expect(geometry.overflow, JSON.stringify(geometry)).toBe(false)
        expect(geometry.fontSize).toBe(14 * textScale)
        expect(geometry.height).toBeGreaterThanOrEqual(48)
        if (textScale === 1) expect(geometry.lines, JSON.stringify(geometry)).toBe(1)
        else {
          expect(geometry.lines, JSON.stringify(geometry)).toBeGreaterThan(1)
          expect(Math.abs(geometry.checkTop - geometry.firstLineTop), JSON.stringify(geometry)).toBeLessThan(geometry.lineHeight / 2)
        }
        process.stdout.write(`Calendar menu geometry ${JSON.stringify({ width, textScale, ...geometry })}\n`)
      }
    } finally { await page.close() }
  })

  it.each([false, true])('fits a seven-column month grid at 320 (loading=%s)', async (isLoading) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <CalendarGrid currentMonth={new Date(2026, 1, 1)} dayMap={seededDayMap('2026-02')} onSelectDay={vi.fn()} todayKey="2026-02-08" weekStartsOn={0} isLoading={isLoading} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => ({
        page: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        card: document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect().width,
        gridScroll: document.querySelector('[data-testid="calendar-grid"]')!.scrollWidth,
        gridWidth: document.querySelector('[data-testid="calendar-grid"]')!.clientWidth,
        targets: [...document.querySelectorAll('button')].map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      }))
      expect(geometry.scroll).toBe(geometry.page)
      expect(geometry.gridScroll).toBeLessThanOrEqual(geometry.gridWidth)
      expect(geometry.card).toBeLessThanOrEqual(312)
      for (const target of geometry.targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44) }
    } finally { await page.close() }
  })

  it('reflows a cross-month Portuguese week label at 200% without clipping', async () => {
    const weekLabel = formatCalendarWeekLabel(new Date(2026, 8, 30), new Date(2026, 9, 6), 'pt-BR')
    const { container } = render(<CalendarWeekNav weekLabel={weekLabel} previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} onCurrentWeek={vi.fn()} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      const geometry = await page.evaluate(() => ({ page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('button')].map((button) => ({ left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, overflow: button.scrollWidth > button.clientWidth })) }))
      expect(geometry.scroll, JSON.stringify(geometry)).toBe(geometry.page)
      for (const button of geometry.buttons) { expect(button.left).toBeGreaterThanOrEqual(16); expect(button.right).toBeLessThanOrEqual(304); expect(button.width).toBeGreaterThanOrEqual(48); expect(button.height).toBeGreaterThanOrEqual(48); expect(button.overflow).toBe(false) }
    } finally { await page.close() }
  })

  it.each([false, true])('contains the range header and grid at 320 and 200% (loading=%s)', async (isLoading) => {
    const model = buildCalendarRangeModel(new Date(2026, 9, 6), seededDayMap('2026-10'), 1, '2026-10-06')
    const rangeLabel = ptBR.calendar.range.label.replace('{start}', format(model.start, 'd MMM', { locale: dateLocale })).replace('{end}', format(model.end, 'd MMM', { locale: dateLocale }))
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <CalendarRangeView model={model} weekdayLabels={['S', 'T', 'Q', 'Q', 'S', 'S', 'D']} rangeLabel={rangeLabel} previousRangeLabel="Previous range" nextRangeLabel="Next range" onPreviousRange={vi.fn()} onNextRange={vi.fn()} nextRangeDisabled={false} isLoading={isLoading} loadingLabel={ptBR.calendar.loading}
        stats={[{ key: 'bestStreak', value: model.stats.bestStreak, label: ptBR.calendar.bestStreak }, { key: 'totalLogs', value: model.stats.totalLogs, label: ptBR.calendar.totalLogs }, { key: 'missed', value: model.stats.missed, label: ptBR.calendar.missedCount }]} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const geometry = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>('.orbit-calendar-grid-frame')!
          return { gridWidth: frame.clientWidth, gridScroll: frame.scrollWidth, label: document.querySelector('p')!.getBoundingClientRect().left, targets: [...document.querySelectorAll('button')].map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right })) }
        })
        expect(geometry.gridScroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.gridWidth)
        expect(geometry.label).toBe(16)
        for (const target of geometry.targets) { expect(target.width).toBeGreaterThanOrEqual(48); expect(target.height).toBeGreaterThanOrEqual(48); expect(target.left).toBeGreaterThanOrEqual(16); expect(target.right).toBeLessThanOrEqual(304) }
      }
    } finally { await page.close() }
  })

  it.each([2026, 2027])('contains the Portuguese %i February header at 320 and double text size', async (year) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <CalendarHeader currentMonth={new Date(year, 1, 1)} todayKey="2026-02-08"
        previousMonthLabel={ptBR.common.previousMonth} nextMonthLabel={ptBR.common.nextMonth}
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        viewSelector={<SegmentedControl fullWidth options={options} value="month" onChange={vi.fn()} label={ptBR.calendar.view.switchLabel} />} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const textScale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, textScale)
        const geometry = await page.evaluate(() => {
          const title = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!
          const titleText = title.querySelector('span')!
          const range = document.createRange()
          range.selectNodeContents(titleText)
          const segments = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
          const targets = [...document.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
            const bounds = button.getBoundingClientRect()
            const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, reachable: button.contains(hit) }
          })
          return {
            pageWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            title: titleText.textContent,
            titleLines: new Set([...range.getClientRects()].map((bounds) => Math.round(bounds.top))).size,
            targets,
            segments: segments.map((button) => ({ width: button.getBoundingClientRect().width, labelWidth: button.firstElementChild!.getBoundingClientRect().width, contentWidth: button.clientWidth - 16, textWidth: button.firstElementChild!.scrollWidth })),
          }
        })
        expect(geometry.scrollWidth).toBe(geometry.pageWidth)
        expect(geometry.title).toBe(year === 2026 ? 'Fevereiro' : 'fev. 2027')
        expect(geometry.titleLines).toBe(1)
        for (const target of geometry.targets) {
          expect(target.width).toBeGreaterThanOrEqual(48)
          expect(target.height).toBeGreaterThanOrEqual(48)
          expect(target.left).toBeGreaterThanOrEqual(16)
          expect(target.right).toBeLessThanOrEqual(304)
          expect(target.reachable).toBe(true)
        }
        for (const segment of geometry.segments) expect(segment.textWidth).toBeLessThanOrEqual(segment.contentWidth + 1)
        if (textScale === 1) expect(geometry.segments.map((segment) => segment.width)).toEqual([72, 72, 72, 72])
      }
    } finally { await page.close() }
  })
})
