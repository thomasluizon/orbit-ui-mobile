import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { format } from 'date-fns'
import { ptBR as dateLocale } from 'date-fns/locale'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import en from '@orbit/shared/i18n/en.json'
import { buildYearRange } from '@orbit/shared/utils'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarHeader, CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { buildCalendarRangeModel, formatCalendarWeekLabel } from '@orbit/shared/utils'
import { CalendarRangeNavigation, CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { DayCell } from '@/components/dates/day-cell'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { Menu } from '@/components/ui/menu'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { revealFocusedControl } from '@/lib/focus-scroll'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))

function seededDayMap(prefix: string) {
  const completed: CalendarDayEntry = { habitId: 'walk', title: 'Caminhar', status: 'completed', isBadHabit: false, dueTime: null, isOneTime: false }
  const missed: CalendarDayEntry = { ...completed, habitId: 'read', title: 'Ler', status: 'missed' }
  return new Map([[`${prefix}-02`, [completed]], [`${prefix}-03`, [completed, missed]], [`${prefix}-04`, [missed]]])
}

function expectFullColumnDays(days: { width: number; height: number; columnWidth: number }[], expectedCount: number) {
  expect(days).toHaveLength(expectedCount)
  for (const day of days) {
    expect(day.width).toBeCloseTo(day.columnWidth, 1)
    expect(day.height).toBeGreaterThanOrEqual(44)
  }
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

  it.each([320, 412, 600, 1352].flatMap((width) => [{ width, locale: 'en', messages: en }, { width, locale: 'pt-BR', messages: ptBR }]))('paints circles inside full-column targets at $width in $locale', async ({ width, locale, messages }) => {
    const model = buildCalendarRangeModel(new Date(2026, 1, 8), seededDayMap('2026-02'), 0, '2026-02-08')
    const words = { none: 'none', partial: 'partial', full: 'full', notScheduled: 'not scheduled', of: 'of', today: 'today', readOnly: 'read only' }
    for (const view of ['month', 'range', 'history'] as const) {
      const { container, unmount } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {view === 'month' ? <CalendarGrid currentMonth={new Date(2026, 1, 1)} dayMap={seededDayMap('2026-02')} onSelectDay={vi.fn()} todayKey="2026-02-08" selectedDateStr="2026-02-08" weekStartsOn={0} />
          : view === 'range' ? <CalendarRangeView model={model} weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']} rangeLabel="Range" isLoading={false} loadingLabel="Loading" stats={[{ key: 'bestStreak', value: 1, label: 'Streak' }, { key: 'totalLogs', value: 1, label: 'Logs' }, { key: 'missed', value: 1, label: 'Missed' }]} />
            : <div style={{ width: 97 }}><DayCell day={8} today habitHistory done={1} scheduled={1} words={words} /></div>}
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate((variables) => { for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value) }, resolveWebThemeVariables('purple', 'dark'))
        const geometry = await page.evaluate(() => {
          const cell = document.querySelector<HTMLElement>('[aria-current="date"][data-outcome], [aria-current="date"]')!
          const slot = cell.closest('[data-calendar-date]') ?? cell
          const bounds = slot.getBoundingClientRect()
          const boxes = [slot, ...slot.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
            const style = getComputedStyle(element)
            if (style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.boxShadow === 'none' && style.outlineStyle === 'none' && Number.parseFloat(style.borderWidth) === 0) return []
            const box = element.getBoundingClientRect()
            return [{ width: box.width, height: box.height, radius: Number.parseFloat(style.borderRadius), center: box.left + box.width / 2, ring: style.boxShadow }]
          })
          const disc = slot.querySelector<HTMLElement>('[data-day-disc]') ?? slot.querySelector<HTMLElement>('[data-outcome] > span') ?? slot.querySelector('span')!
          const discBox = disc.getBoundingClientRect()
          const header = document.querySelector('[data-testid="month-grid-header"]')?.getBoundingClientRect()
          const days = document.querySelector('[data-testid="month-grid-days"]')?.getBoundingClientRect()
          return { boxes, center: bounds.left + bounds.width / 2, disc: { width: discBox.width, height: discBox.height }, headerGap: header && days ? days.top - header.bottom : undefined }
        })
        expect(geometry.boxes.length).toBeGreaterThan(0)
        for (const box of geometry.boxes) {
          expect(box.width, view).toBeLessThanOrEqual(44.5)
          expect(Math.abs(box.width - box.height), view).toBeLessThanOrEqual(0.5)
          expect(box.radius, view).toBeGreaterThanOrEqual(box.width / 2)
          expect(Math.abs(box.center - geometry.center), view).toBeLessThanOrEqual(0.5)
        }
        expect(geometry.disc.width, view).toBeCloseTo(34, 1)
        expect(geometry.disc.height, view).toBeCloseTo(34, 1)
        expect(geometry.boxes.filter((box) => box.ring.includes('2px'))).toHaveLength(1)
        if (view !== 'history') expect(geometry.headerGap).toBeCloseTo(8, 1)
      } finally { await page.close(); unmount() }
    }
  })

  it.each(['light', 'dark'] as const)('paints ghost chevrons and a transparent month title in %s mode', async (mode) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-04" previousMonthLabel="Previous" nextMonthLabel="Next"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await page.evaluate(({ mode, variables }) => {
        document.documentElement.className = mode
        for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
      }, { mode, variables: resolveWebThemeVariables('orange', mode) })
      await loadAppFonts(page)
      for (const label of ['Previous', 'Next']) {
        const control = page.getByRole('button', { name: label, exact: true })
        const resting = await control.evaluate((button) => {
          const style = getComputedStyle(button)
          return { background: style.backgroundColor, ring: style.boxShadow, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }
        })
        expect(resting.background).toBe('rgba(0, 0, 0, 0)')
        expect(resting.ring).toContain('1.5px')
        expect(resting.ring).toContain('inset')
        expect(resting.width).toBeGreaterThanOrEqual(48)
        expect(resting.height).toBeGreaterThanOrEqual(48)
        await control.hover()
        await expect.poll(() => control.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(resting.background)
        await page.mouse.move(0, 0)
      }
      const title = page.getByRole('button', { name: `September, ${en.calendar.monthPicker}` })
      expect(await title.evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, radius: getComputedStyle(button).borderRadius }))).toEqual({ background: 'rgba(0, 0, 0, 0)', radius: '12px' })
    } finally { await page.close() }
  })

  it.each([320, 412])('contains the year viewport and reaches both ends at 640x%i', async (height) => {
    render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <CalendarHeader currentMonth={new Date(2026, 1, 1)} todayKey="2026-02-08"
        previousMonthLabel={ptBR.common.previousMonth} nextMonthLabel={ptBR.common.nextMonth}
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
    </NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: `Fevereiro, ${ptBR.calendar.monthPicker}` }))
    fireEvent.click(screen.getByRole('button', { name: `2026, ${ptBR.common.selectYear}` }))
    const portal = document.querySelector('.orbit-sheet-portal')!
    const years = buildYearRange(2026)
    const page = await browser.newPage({ viewport: { width: 640, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${portal.outerHTML}`)
      await loadAppFonts(page)
      await page.evaluate(`document.querySelector('[data-focus-inset]').addEventListener('focusin', (${revealFocusedControl.toString()}))`)
      const containment = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-slot="sheet-body"]')!
        const scroller = body.querySelector<HTMLElement>('[data-focus-inset]')!
        const actions = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
        const bodyBox = body.getBoundingClientRect()
        const scrollBox = scroller.getBoundingClientRect()
        return { bodyBottom: bodyBox.bottom - Number.parseFloat(getComputedStyle(body).paddingBottom), scrollBottom: scrollBox.bottom,
          height: scrollBox.height, outerScroll: body.scrollHeight > body.clientHeight, footerTop: actions.getBoundingClientRect().top }
      })
      expect(containment.scrollBottom, JSON.stringify(containment)).toBeLessThanOrEqual(containment.bodyBottom + 1)
      expect(containment.height).toBeGreaterThanOrEqual(48)
      expect(containment.outerScroll).toBe(false)
      expect(containment.scrollBottom).toBeLessThanOrEqual(containment.footerTop)
      for (const year of [years[0]!, years.at(-1)!]) {
        await page.evaluate((year) => {
          const target = [...document.querySelectorAll<HTMLButtonElement>('[data-focus-inset] button')].find((button) => button.textContent === String(year))!
          target.parentElement!.parentElement!.scrollTop = year < 2026 ? 0 : target.parentElement!.parentElement!.scrollHeight
        }, year)
        const target = page.getByRole('button', { name: String(year), exact: true })
        expect(await target.evaluate((button) => {
          const bounds = button.getBoundingClientRect()
          return button.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))
        })).toBe(true)
        await target.click()
        await page.evaluate(() => { (document.activeElement as HTMLElement).blur(); document.querySelector<HTMLElement>('[data-focus-inset]')!.scrollTop = 0 })
        await page.getByRole('button', { name: String(years[0]!), exact: true }).focus()
        if (year === years.at(-1)) {
          for (let index = 1; index < years.length; index++) await page.keyboard.press('Tab')
        }
        await page.keyboard.press('Enter')
        const keyboardGeometry = await target.evaluate((button) => {
          const viewport = button.parentElement!.parentElement!.getBoundingClientRect()
          const bounds = button.getBoundingClientRect()
          return { focused: document.activeElement === button, top: bounds.top, bottom: bounds.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom }
        })
        expect(keyboardGeometry.focused).toBe(true)
        expect(keyboardGeometry.top, JSON.stringify(keyboardGeometry)).toBeGreaterThanOrEqual(keyboardGeometry.viewportTop - 1)
        expect(keyboardGeometry.bottom, JSON.stringify(keyboardGeometry)).toBeLessThanOrEqual(keyboardGeometry.viewportBottom + 1)
      }
    } finally { await page.close() }
  })

  it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('fits the picker header in $locale at 320 and enlarged text', async ({ locale, messages }) => {
    render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <CalendarHeader currentMonth={new Date(2026, 1, 1)} todayKey="2026-02-08" previousMonthLabel="Previous" nextMonthLabel="Next"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
    </NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`, ${messages.calendar.monthPicker}$`) }))
    expect(screen.getByRole('dialog', { name: messages.calendar.monthPicker })).toBeInTheDocument()
    const portal = document.querySelector('.orbit-sheet-portal')!
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${portal.outerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const header = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll<HTMLButtonElement>('.orbit-sheet-header button')]
          return buttons.map((button) => {
            const box = button.getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(button)
            return { label: button.getAttribute('aria-label'), text: button.textContent, width: box.width, height: box.height,
              left: box.left, right: box.right, textWidth: range.getBoundingClientRect().width, overflow: button.scrollWidth > button.clientWidth }
          })
        })
        expect(header[0]!.label).toBe(`2026, ${messages.common.selectYear}`)
        expect(header[0]!.text).toBe('2026')
        expect(header[0]!.width).toBeGreaterThanOrEqual(48)
        expect(header[0]!.height).toBeGreaterThanOrEqual(48)
        expect(header[0]!.right).toBeLessThanOrEqual(header[1]!.left)
        for (const control of header) {
          expect(control.overflow).toBe(false)
          expect(control.textWidth).toBeLessThanOrEqual(control.width)
          expect(control.left).toBeGreaterThanOrEqual(0)
          expect(control.right).toBeLessThanOrEqual(320)
        }
      }
    } finally { await page.close() }
  })

  it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('fits compact onboarding segment labels in $locale at 320', async ({ messages }) => {
    const labels = messages.onboarding.flow.when
    const { container } = render(<div style={{ padding: 16 }}><SegmentedControl label={labels.scheduleMode} value="fixed" onChange={vi.fn()}
      options={[{ value: 'fixed', label: labels.fixedMode }, { value: 'flexible', label: labels.flexibleMode }, { value: 'interval', label: labels.intervalMode }, { value: 'oneTime', label: labels.oneTimeMode }]} /></div>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const geometry = await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')].map((button) => {
          const label = button.querySelector('span')!
          const range = document.createRange()
          range.selectNodeContents(label)
          const bounds = range.getBoundingClientRect()
          const box = label.getBoundingClientRect()
          return { text: label.textContent, fits: bounds.width <= box.width + 1, right: bounds.right, lines: range.getClientRects().length, overflow: label.scrollWidth > label.clientWidth,
            ellipsis: getComputedStyle(label).textOverflow === 'ellipsis', width: button.getBoundingClientRect().width }
        }))
        for (const label of geometry) {
          expect(label.fits, JSON.stringify(geometry)).toBe(true)
          expect(label.overflow).toBe(false)
          expect(label.ellipsis).toBe(false)
          expect(label.lines).toBe(1)
          expect(label.right).toBeLessThanOrEqual(304)
        }
        expect(new Set(geometry.map((label) => label.width)).size).toBe(1)
      }
    } finally { await page.close() }
  })

  it.each([{ width: 412, height: 56 }, { width: 1280, height: 48 }])('retains shared menu row height at $width', async ({ width, height }) => {
    render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC"><Menu open presentation="sheet" title={ptBR.calendar.options} items={[{ id: 'legend', label: ptBR.calendar.legendTitle }]} /></NextIntlClientProvider>)
    const portal = document.querySelector('.orbit-sheet-portal')!
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${portal.outerHTML}`)
      await loadAppFonts(page)
      if (width === 1280) await page.evaluate(() => { const rows = document.querySelector('.orbit-menu-items')!; document.body.append(rows); document.querySelector('.orbit-sheet-portal')!.remove() })
      const row = page.getByRole('menuitem')
      expect(await row.evaluate((element) => element.getBoundingClientRect().height)).toBe(height)
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      expect(await row.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(height)
      expect(await row.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
    } finally { await page.close() }
  })

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

  it.each([320, 600, 840, 1100, 1352].flatMap((width) => [false, true].map((isLoading) => ({ width, isLoading }))))('fills a seven-column month grid at $width (loading=$isLoading)', async ({ width, isLoading }) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <CalendarGrid currentMonth={new Date(2026, 1, 1)} dayMap={seededDayMap('2026-02')} onSelectDay={vi.fn()} todayKey="2026-02-08" selectedDateStr="2026-02-01" weekStartsOn={0} isLoading={isLoading} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => ({
        page: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        card: document.querySelector('[data-testid="calendar-grid-card"]')!.getBoundingClientRect().width,
        gridScroll: document.querySelector('[data-testid="calendar-grid"]')!.scrollWidth,
        gridWidth: document.querySelector('[data-testid="calendar-grid"]')!.clientWidth,
        contentWidth: document.querySelector('[data-testid="calendar-grid"]')!.clientWidth - 32,
        placeholders: [...document.querySelectorAll<HTMLElement>('[data-variant="grid"] span')].map((placeholder, index) => {
          const grid = document.querySelector<HTMLElement>('[data-cols="7"]')!
          const style = getComputedStyle(grid)
          const columnWidths = style.gridTemplateColumns.split(' ').map((track) => Number.parseFloat(track))
          const column = index % 7
          const precedingWidth = columnWidths.slice(0, column).reduce((total, track) => total + track, 0)
          const bounds = placeholder.getBoundingClientRect()
          return { center: bounds.left + bounds.width / 2, columnCenter: grid.getBoundingClientRect().left + precedingWidth + column * Number.parseFloat(style.columnGap) + columnWidths[column]! / 2 }
        }),
        targets: [...document.querySelectorAll('button')].map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, columnWidth: button.parentElement!.getBoundingClientRect().width })),
      }))
      expect(geometry.scroll).toBe(geometry.page)
      expect(geometry.gridScroll).toBeLessThanOrEqual(geometry.gridWidth)
      expect(geometry.card).toBe(geometry.contentWidth)
      expect(geometry.placeholders).toHaveLength(isLoading ? 28 : 0)
      for (const placeholder of geometry.placeholders) expect(placeholder.center).toBeCloseTo(placeholder.columnCenter, 1)
      expect(geometry.targets).toHaveLength(isLoading ? 0 : 28)
      for (const target of geometry.targets) { expect(target.width).toBeCloseTo(target.columnWidth, 1); expect(target.height).toBeGreaterThanOrEqual(44) }
    } finally { await page.close() }
  })

  it.each([320, 339, 340, 360, 363, 363.5, 364, 365, 412, 600, 840, 1352].flatMap((width) => [false, true].flatMap((isLoading) =>
    (['month', 'range'] as const).flatMap((view) => [{ width, isLoading, view, locale: 'en', messages: en }, { width, isLoading, view, locale: 'pt-BR', messages: ptBR }]),
  )))('aligns $view tracks and contained rings at $width in $locale (loading=$isLoading)', async ({ width, isLoading, view, locale, messages }) => {
    const model = buildCalendarRangeModel(new Date(2026, 1, 8), seededDayMap('2026-02'), 0, '2026-02-08')
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width }}>
      <CalendarHeader currentMonth={new Date(2026, 1, 1)} todayKey="2026-02-08" previousMonthLabel="Previous" nextMonthLabel="Next"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        viewSelector={<SegmentedControl fullWidth options={[{ value: 'month', label: messages.calendar.view.month }, { value: 'week', label: messages.calendar.view.week }, { value: 'agenda', label: messages.calendar.view.agenda }, { value: 'range', label: messages.calendar.view.range }]} value={view} onChange={vi.fn()} label={messages.calendar.view.switchLabel} />} />
      {view === 'month' ? <CalendarGrid currentMonth={new Date(2026, 1, 1)} dayMap={seededDayMap('2026-02')} onSelectDay={vi.fn()}
        todayKey="2026-02-08" selectedDateStr="2026-02-01" weekStartsOn={0} isLoading={isLoading} />
        : <CalendarRangeView model={model} weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']} rangeLabel="Range" isLoading={isLoading} loadingLabel={messages.calendar.loading}
          stats={[{ key: 'bestStreak', value: model.stats.bestStreak, label: messages.calendar.bestStreak }, { key: 'totalLogs', value: model.stats.totalLogs, label: messages.calendar.totalLogs }, { key: 'missed', value: model.stats.missed, label: messages.calendar.missedCount }]} />}
    </div></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: Math.ceil(width), height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('.orbit-calendar-grid-card')!
        const grid = frame.querySelector<HTMLElement>('[data-testid="month-grid-days"], [data-cols="7"]')!
        const selector = document.querySelector('[role="radiogroup"]')!.getBoundingClientRect()
        const bounds = grid.getBoundingClientRect()
        const gap = Number.parseFloat(getComputedStyle(grid).columnGap)
        const slots = [...grid.children].map((slot) => {
          const box = slot.getBoundingClientRect()
          const disc = (slot.matches('[data-outcome]') ? slot.querySelector(':scope > span') : slot.querySelector('[data-outcome] > span')) ?? slot.querySelector('[data-variant="grid"] span')
          const visual = disc?.getBoundingClientRect()
          const future = slot.querySelector('[role="img"]:not([data-outcome])')
          const futureBox = future?.getBoundingClientRect()
          const numeral = future?.firstElementChild?.getBoundingClientRect()
          return { futureWidth: futureBox?.width, futureCentered: !numeral || Math.abs(numeral.left + numeral.width / 2 - box.left - box.width / 2) <= 0.5, width: box.width, height: box.height, contained: !visual || (visual.left >= box.left - 0.5 && visual.right <= box.right + 0.5), square: !visual || Math.abs(visual.width - visual.height) <= 0.5 }
        })
        return { gap, left: bounds.left, right: bounds.right, switchLeft: selector.left, switchRight: selector.right, slots,
          scrollWidth: document.documentElement.scrollWidth, selected: grid.querySelector('[data-selected="true"]')?.getBoundingClientRect().width }
      })
      expect(Math.abs(geometry.left - geometry.switchLeft)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(geometry.right - geometry.switchRight)).toBeLessThanOrEqual(0.5)
      expect(geometry.gap).toBe(width < 364 ? 0 : 4)
      expect(geometry.slots.length).toBeGreaterThanOrEqual(14)
      for (const slot of geometry.slots) {
        expect(slot.width).toBeCloseTo((width - 32 - 6 * geometry.gap) / 7, 1)
        expect(slot.height).toBeGreaterThanOrEqual(44)
        expect(slot.contained).toBe(true)
        expect(slot.futureCentered).toBe(true)
        if (slot.futureWidth !== undefined) expect(slot.futureWidth).toBeCloseTo(slot.width, 1)
        if (!isLoading) expect(slot.square).toBe(true)
        expect(slot.width).toBeCloseTo(geometry.slots[0]!.width, 1)
      }
      if (view === 'month' && !isLoading) expect(geometry.selected).toBeCloseTo(geometry.slots[0]!.width, 1)
      if (width === 320) expect(geometry.scrollWidth).toBeLessThanOrEqual(width)
    } finally { await page.close() }
  })

  it.each([320, 412, 600, 840].flatMap((width) => [{ width, locale: 'en', messages: en }, { width, locale: 'pt-BR', messages: ptBR }]))('keeps the week pager in one 48px line at $width in $locale and reflows at 200%', async ({ width, locale, messages }) => {
    const viewOptions = [
      { value: 'month', label: messages.calendar.view.month },
      { value: 'week', label: messages.calendar.view.week },
      { value: 'range', label: messages.calendar.view.range },
      { value: 'agenda', label: messages.calendar.view.agenda },
    ] as const
    const weekLabel = formatCalendarWeekLabel(new Date(2026, 7, 31), new Date(2026, 8, 6), locale)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><main style={{ height: 915, overflowY: 'auto', scrollbarGutter: 'stable' }}>
      <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-30" previousMonthLabel="Previous month" nextMonthLabel="Next month"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        periodNavigation={<CalendarWeekNav weekLabel={weekLabel} previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} onCurrentWeek={vi.fn()} />}
        viewSelector={<SegmentedControl fullWidth options={viewOptions} value="week" onChange={vi.fn()} label={messages.calendar.view.switchLabel} />} />
    </main></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        const geometry = await page.evaluate(() => {
          const selector = document.querySelector('[role="radiogroup"]')!.getBoundingClientRect()
          const controls = [...document.querySelectorAll('[data-testid="calendar-week-navigation"] button')].map((button) => {
            const box = button.getBoundingClientRect()
            const content = document.createRange(); content.selectNodeContents(button)
            const contentBox = content.getBoundingClientRect()
            return { left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height, overflow: contentBox.left < box.left || contentBox.right > box.right }
          })
          const navigation = document.querySelector('[data-testid="calendar-week-navigation"]')!
          const title = navigation.querySelectorAll('button')[1]!
          const range = document.createRange(); range.selectNodeContents(title.querySelector('span') ?? title)
          return { navigationHeight: navigation.getBoundingClientRect().height, titleLines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, titleRadius: Number.parseFloat(getComputedStyle(title).borderRadius), titleHeight: title.getBoundingClientRect().height, selectorTop: selector.top, selectorBottom: selector.bottom, controls, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
        })
        expect(geometry.controls).toHaveLength(3)
        if (scale === 1) { expect(geometry.navigationHeight).toBe(48); expect(geometry.titleLines).toBe(1); expect(geometry.selectorTop).toBe(76) }
        expect(geometry.titleRadius).toBeGreaterThanOrEqual(geometry.titleHeight / 2)
        expect(geometry.overflow).toBe(false)
        for (const control of geometry.controls) {
          expect(control.bottom).toBeLessThanOrEqual(geometry.selectorTop)
          expect(control.bottom).toBeLessThan(geometry.selectorBottom)
          expect(control.width).toBeGreaterThanOrEqual(48)
          expect(control.height).toBeGreaterThanOrEqual(48)
          expect(control.left).toBeGreaterThanOrEqual(16)
          expect(control.right).toBeLessThanOrEqual(width - 16)
          expect(control.overflow).toBe(false)
        }
      }
    } finally { await page.close() }
  })

  it('reflows a cross-month Portuguese week label at 200% without clipping', async () => {
    const weekLabel = formatCalendarWeekLabel(new Date(2026, 8, 30), new Date(2026, 9, 6), 'pt-BR')
    const { container } = render(<div style={{ paddingInline: 16 }}><CalendarWeekNav weekLabel={weekLabel} previousWeekLabel="Previous week" nextWeekLabel="Next week" currentWeekLabel="Current week" onPreviousWeek={vi.fn()} onNextWeek={vi.fn()} onCurrentWeek={vi.fn()} /></div>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      const geometry = await page.evaluate(() => ({ page: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('button')].map((button) => {
        const box = button.getBoundingClientRect()
        const content = document.createRange(); content.selectNodeContents(button)
        const contentBox = content.getBoundingClientRect()
        return { left: box.left, right: box.right, width: box.width, height: box.height, overflow: contentBox.left < box.left || contentBox.right > box.right }
      }) }))
      expect(geometry.scroll, JSON.stringify(geometry)).toBe(geometry.page)
      for (const button of geometry.buttons) { expect(button.left).toBeGreaterThanOrEqual(16); expect(button.right).toBeLessThanOrEqual(304); expect(button.width).toBeGreaterThanOrEqual(48); expect(button.height).toBeGreaterThanOrEqual(48); expect(button.overflow).toBe(false) }
    } finally { await page.close() }
  })

  it.each([320, 360, 412, 600, 840].flatMap((width) => [false, true].map((isLoading) => ({ width, isLoading }))))('contains the production range statistics, header and grid at $width and 200% (loading=$isLoading)', async ({ width, isLoading }) => {
    const model = buildCalendarRangeModel(new Date(2026, 9, 6), seededDayMap('2026-10'), 1, '2026-10-06')
    const rangeLabel = ptBR.calendar.range.label.replace('{start}', format(model.start, 'd MMM', { locale: dateLocale })).replace('{end}', format(model.end, 'd MMM', { locale: dateLocale }))
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
      <div style={{ paddingInline: 16 }}><CalendarRangeNavigation rangeLabel={rangeLabel} previousRangeLabel="Previous range" nextRangeLabel="Next range" onPreviousRange={vi.fn()} onNextRange={vi.fn()} nextRangeDisabled={false} /></div>
      <CalendarRangeView model={model} weekdayLabels={['S', 'T', 'Q', 'Q', 'S', 'S', 'D']} rangeLabel={rangeLabel} isLoading={isLoading} loadingLabel={ptBR.calendar.loading}
        stats={[{ key: 'bestStreak', value: model.stats.bestStreak, label: ptBR.calendar.bestStreak }, { key: 'totalLogs', value: model.stats.totalLogs, label: ptBR.calendar.totalLogs }, { key: 'missed', value: model.stats.missed, label: ptBR.calendar.missedCount }]} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => {
          document.documentElement.style.fontSize = `${16 * scale}px`
          if (scale === 2) {
            const fixedMetrics = [...document.querySelectorAll<HTMLElement>('section, div, p, span')].map((element) => ({
              element, fontSize: element.style.fontSize, lineHeight: element.style.lineHeight,
            }))
            for (const { element, fontSize, lineHeight } of fixedMetrics) {
              if (fontSize.endsWith('px')) element.style.fontSize = `${parseFloat(fontSize) * scale}px`
              if (lineHeight.endsWith('px')) element.style.lineHeight = `${parseFloat(lineHeight) * scale}px`
            }
          }
        }, scale)
        const geometry = await page.evaluate(() => {
          const frame = document.querySelector<HTMLElement>('.orbit-calendar-grid-frame')!
          const stats = document.querySelector<HTMLElement>('[data-testid="calendar-stats"]')!
          const labelText = document.querySelector('p')!.firstChild!
          const splitWords = [...labelText.textContent!.matchAll(/\S+/g)].filter((word) => {
            const range = document.createRange()
            range.setStart(labelText, word.index)
            range.setEnd(labelText, word.index + word[0].length)
            return new Set([...range.getClientRects()].map((box) => box.top)).size > 1
          }).map((word) => word[0])
          return { pageWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            cardWidth: frame.firstElementChild!.getBoundingClientRect().width, frameContentWidth: frame.clientWidth - 32,
            frameWidth: frame.getBoundingClientRect().width, sectionContentWidth: frame.parentElement!.clientWidth,
            days: [...frame.querySelectorAll<HTMLElement>('[data-outcome]')].map((day) => ({ width: day.getBoundingClientRect().width, height: day.getBoundingClientRect().height, columnWidth: Number.parseFloat(getComputedStyle(day.parentElement!).gridTemplateColumns.split(' ')[0]!) })),
            splitWords,
            statsLeft: stats.getBoundingClientRect().left, statsRight: stats.getBoundingClientRect().right,
            placeholders: [...stats.querySelectorAll<HTMLElement>('[role="status"]')].map((value) => {
              const bounds = value.lastElementChild!.getBoundingClientRect()
              const figure = value.parentElement!.getBoundingClientRect()
              return { left: bounds.left, right: bounds.right, width: bounds.width, figureLeft: figure.left, figureRight: figure.right, fontSize: parseFloat(getComputedStyle(value).fontSize) }
            }), gridWidth: frame.clientWidth, gridScroll: frame.scrollWidth, label: document.querySelector('p')!.getBoundingClientRect().left, labelCenter: (document.querySelector('p')!.getBoundingClientRect().top + document.querySelector('p')!.getBoundingClientRect().bottom) / 2, labelOverflow: document.querySelector('p')!.scrollWidth > document.querySelector('p')!.clientWidth, targets: [...document.querySelectorAll('button')].map((button) => ({ center: (button.getBoundingClientRect().top + button.getBoundingClientRect().bottom) / 2, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right })) }
        })
        expect(geometry.scrollWidth, JSON.stringify(geometry)).toBe(geometry.pageWidth)
        expect(geometry.statsLeft).toBeGreaterThanOrEqual(0)
        expect(geometry.statsRight).toBeLessThanOrEqual(width)
        expect(geometry.placeholders).toHaveLength(isLoading ? 3 : 0)
        for (const placeholder of geometry.placeholders) {
          expect(placeholder.left).toBeGreaterThanOrEqual(placeholder.figureLeft)
          expect(placeholder.right).toBeLessThanOrEqual(placeholder.figureRight)
          expect(placeholder.width).toBeGreaterThan(0)
          expect(placeholder.width).toBeLessThanOrEqual(64)
          expect(placeholder.fontSize).toBe(22 * scale)
        }
        expect(geometry.cardWidth).toBe(geometry.frameContentWidth)
        expect(geometry.frameWidth).toBe(geometry.sectionContentWidth)
        expect(geometry.frameWidth).toBe(width)
        expectFullColumnDays(geometry.days, isLoading ? 0 : model.days.length)
        expect(geometry.gridScroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.gridWidth)
        expect(geometry.label).toBe(16)
        expect(geometry.labelOverflow).toBe(false)
        expect(geometry.splitWords).toEqual([])
        if (scale === 1) for (const target of geometry.targets) expect(Math.abs(geometry.labelCenter - target.center)).toBeLessThanOrEqual(2)
        for (const target of geometry.targets) { expect(target.width).toBeGreaterThanOrEqual(48); expect(target.height).toBeGreaterThanOrEqual(48); expect(target.left).toBeGreaterThanOrEqual(16); expect(target.right).toBeLessThanOrEqual(width - 16) }
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
