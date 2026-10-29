import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildCalendarRangeModel, formatCalendarSpanEnds } from '@orbit/shared/utils'
import { segmentTranslation } from '../../../../../packages/shared/src/test-support/segmented-control-inventory'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { readExpandedControlGeometry } from '@/e2e/layout/expanded-control-geometry'
import { measureSplitSegmentWords, mountMeasuredSegmentedControls } from '@/__tests__/support/segmented-control-geometry'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { calendarGeometryHarness, calendarKeys, seededDayMap } from '@/__tests__/support/calendar-header-geometry'

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))

function measureCalendarSegments() {
  const group = document.querySelector('[data-testid="calendar-header-group"] [data-segmented-control]')!
  const bounds = group.getBoundingClientRect()
  return [...group.querySelectorAll('[role="radio"], [data-menu-trigger]')].map((button) => {
    const box = button.getBoundingClientRect()
    const label = button.firstElementChild!
    const content = label.getBoundingClientRect()
    const range = document.createRange(); range.selectNodeContents(label)
    const fragments = [...range.getClientRects()]
    return { folded: button.hasAttribute('data-menu-trigger'), top: box.top, width: box.width, height: box.height, lines: new Set(fragments.map((fragment) => Math.round(fragment.top))).size,
      contained: box.left >= bounds.left && box.right <= bounds.right,
      fits: fragments.every((fragment) => fragment.left >= content.left - 1 && fragment.right <= content.right + 1),
      overflow: label.scrollWidth > label.clientWidth, ellipsis: getComputedStyle(label).textOverflow === 'ellipsis' }
  })
}

function expectCalendarSegments(segments: ReturnType<typeof measureCalendarSegments>, scale: number) {
  expect(segments).toHaveLength(segments[0]?.folded ? 1 : calendarKeys.length)
  if (scale === 1) expect(segments[0]?.folded).toBe(false)
  expect(new Set(segments.map((segment) => segment.top)).size).toBe(1)
  for (const segment of segments) {
    expect(segment.width).toBeGreaterThanOrEqual(48)
    expect(segment.height).toBeGreaterThanOrEqual(48)
    expect(segment.contained).toBe(true)
    expect(segment.fits).toBe(true)
    expect(segment.overflow).toBe(false)
    expect(segment.ellipsis).toBe(false)
    if (scale === 1) expect(segment.lines).toBe(1)
  }
}

describe('Calendar header geometry in Chromium', () => {
  const harness = calendarGeometryHarness(registerChromeLaunchHook)

  it.each([320, 339, 340, 360, 363, 363.5, 364, 365, 412, 600, 840, 1352].flatMap((width) => [false, true].flatMap((isLoading) =>
    (['month', 'range'] as const).flatMap((view) => [{ width, isLoading, view, locale: 'en', messages: en }, { width, isLoading, view, locale: 'pt-BR', messages: ptBR }]),
  )))('aligns $view tracks and contained rings at $width in $locale (loading=$isLoading)', async ({ width, isLoading, view, locale, messages }) => {
    const model = buildCalendarRangeModel(new Date(2026, 1, 8), seededDayMap('2026-02'), 0, '2026-02-08')
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><div style={{ width }}>
      <CalendarHeader currentMonth={new Date(2026, 1, 1)} todayKey="2026-02-08" previousMonthLabel="Previous" nextMonthLabel="Next"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        viewSelector={<SegmentedControl fullWidth options={[{ value: 'month', label: segmentTranslation(messages, calendarKeys[0]!) }, { value: 'week', label: segmentTranslation(messages, calendarKeys[1]!) }, { value: 'agenda', label: segmentTranslation(messages, calendarKeys[3]!) }, { value: 'range', label: segmentTranslation(messages, calendarKeys[2]!) }]} value={view} onChange={vi.fn()} label={messages.calendar.view.switchLabel} />} />
      {view === 'month' ? <CalendarGrid currentMonth={new Date(2026, 1, 1)} dayMap={seededDayMap('2026-02')} onSelectDay={vi.fn()}
        todayKey="2026-02-08" selectedDateStr="2026-02-01" weekStartsOn={0} isLoading={isLoading} />
        : <CalendarRangeView model={model} weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']} rangeLabel="Range" isLoading={isLoading} loadingLabel={messages.calendar.loading}
          stats={[{ key: 'bestStreak', value: model.stats.bestStreak, label: messages.calendar.bestStreak }, { key: 'totalLogs', value: model.stats.totalLogs, label: messages.calendar.totalLogs }, { key: 'missed', value: model.stats.missed, label: messages.calendar.missedCount }]} />}
    </div></NextIntlClientProvider>)
    const page = await harness.browser.newPage({ viewport: { width: Math.ceil(width), height: 915 } })
    try {
      await page.setContent(`<style>${harness.stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await mountMeasuredSegmentedControls(page)
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('.orbit-calendar-grid-card')!
        const grid = frame.querySelector<HTMLElement>('[data-testid="month-grid-days"], [data-cols="7"]')!
        const selector = document.querySelector('[data-segmented-control]')!.getBoundingClientRect()
        const bounds = grid.getBoundingClientRect()
        const gap = Number.parseFloat(getComputedStyle(grid).columnGap)
        const slots = [...grid.children].map((slot) => {
          const box = slot.getBoundingClientRect()
          const disc = slot.querySelector('[data-day-circle], [data-variant="grid"] span')
          const visual = disc?.getBoundingClientRect()
          const future = slot.querySelector('[role="img"]:not([data-outcome])')
          const futureBox = future?.getBoundingClientRect()
          const numeral = future?.querySelector('[data-day-future-numeral]')?.getBoundingClientRect()
          return { futureWidth: futureBox?.width, futureCentered: !numeral || !visual || Math.abs(numeral.left + numeral.width / 2 - visual.left - visual.width / 2) <= 0.5, width: box.width, height: box.height, contained: !visual || (visual.left >= box.left - 0.5 && visual.right <= box.right + 0.5), square: !visual || Math.abs(visual.width - visual.height) <= 0.5 }
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

  it.each([320, 360, 384, 412, 600, 840].flatMap((width) => (['month', 'week', 'range', 'agenda'] as const).flatMap((view) =>
    [{ width, view, locale: 'en', messages: en }, { width, view, locale: 'pt-BR', messages: ptBR }],
  )))('keeps the $view pager in one 48px line at $width in $locale and reflows at 200%', async ({ width, view, locale, messages }) => {
    const viewOptions = [
      { value: 'month', label: segmentTranslation(messages, calendarKeys[0]!) },
      { value: 'week', label: segmentTranslation(messages, calendarKeys[1]!) },
      { value: 'range', label: segmentTranslation(messages, calendarKeys[2]!) },
      { value: 'agenda', label: segmentTranslation(messages, calendarKeys[3]!) },
    ] as const
    const ends = formatCalendarSpanEnds(new Date(2026, 7, 31), new Date(2026, 8, 6), locale)
    const weekLabel = messages.calendar.range.label.replace('{start}', ends.start).replace('{end}', ends.end)
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><main style={{ height: 915, overflowY: 'auto', scrollbarGutter: 'stable' }}>
      <CalendarHeader currentMonth={new Date(2026, 8, 1)} todayKey="2026-09-30" previousMonthLabel="Previous month" nextMonthLabel="Next month"
        onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()}
        period={view === 'month' ? undefined : { view, label: weekLabel, previousLabel: "Previous week", nextLabel: "Next week", onPrevious: vi.fn(), onNext: vi.fn(), onCurrent: vi.fn() }}
        viewSelector={<SegmentedControl fullWidth options={viewOptions} value={view} onChange={vi.fn()} label={messages.calendar.view.switchLabel} />} />
    </main></NextIntlClientProvider>)
    const page = await harness.browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${harness.stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      await mountMeasuredSegmentedControls(page)
      for (const scale of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
        await vi.waitFor(async () => {
          expect(await page.evaluate(measureSplitSegmentWords)).toEqual([])
          const geometry = await page.evaluate(() => {
            const selector = document.querySelector('[data-segmented-control]')!.getBoundingClientRect()
            const controls = [...document.querySelectorAll('[data-testid="calendar-header-group"] [data-testid$="-navigation"] button')].map((button) => {
              const box = button.getBoundingClientRect()
              const content = document.createRange(); content.selectNodeContents(button)
              const contentBox = content.getBoundingClientRect()
              return { left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height, overflow: contentBox.left < box.left || contentBox.right > box.right }
            })
            const navigation = document.querySelector('[data-testid="calendar-header-group"] [data-testid$="-navigation"]')!
            const title = navigation.querySelectorAll('button')[1]!
            const range = document.createRange(); range.selectNodeContents(title.querySelector('span') ?? title)
            return { navigationHeight: navigation.getBoundingClientRect().height, titleLines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, titleRadius: Number.parseFloat(getComputedStyle(title).borderRadius), titleHeight: title.getBoundingClientRect().height, selectorTop: selector.top, selectorBottom: selector.bottom, controls, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
          })
          expectCalendarSegments(await page.evaluate(measureCalendarSegments), scale)
          expect(geometry.controls).toHaveLength(view === 'month' ? 4 : 3)
          if (scale === 1) { expect(geometry.navigationHeight, JSON.stringify(geometry)).toBe(48); expect(geometry.titleLines).toBe(1); expect(geometry.selectorTop).toBe(76) }
          expect(geometry.titleRadius).toBe(12)
          expect(geometry.overflow).toBe(false)
          for (const control of geometry.controls) {
            expect(control.bottom).toBeLessThanOrEqual(geometry.selectorTop)
            expect(control.bottom).toBeLessThan(geometry.selectorBottom)
            expect(control.width).toBeGreaterThanOrEqual(view === 'month' ? 32 : 44)
            expect(control.height).toBeGreaterThanOrEqual(44)
            expect(control.left).toBeGreaterThanOrEqual(16)
            expect(control.right).toBeLessThanOrEqual(width - 16)
            expect(control.overflow).toBe(false)
          }
          for (const control of await page.locator('[data-testid="calendar-header-group"] [data-testid$="-navigation"] button').all()) {
            const target = await control.evaluate(readExpandedControlGeometry)
            expect(target.width).toBeGreaterThanOrEqual(48)
            expect(target.height).toBeGreaterThanOrEqual(48)
            expect(target.edgeHits).toEqual([true, true, true, true])
          }
        }, { timeout: 2000 })
      }
    } finally { await page.close() }
  })

})
