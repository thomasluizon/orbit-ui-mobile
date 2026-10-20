import { describe, expect, it } from 'vitest'
import { resolveBarChartReadout, resolveBarChartSelection, resolveBarChartGeometry, stepSelection, BAR_CHART_HEIGHT } from '../contracts/display'
import { INTERACTION_FILL_CLEARANCE } from '../theme/interaction'
import { mapCompletionSeries } from '../utils/completion-series'

describe('bar chart geometry', () => {
  it.each([1, 7, 30, 53])('lays out %i ordered bars inside 320 pixels', (count) => {
    const bars = resolveBarChartGeometry(Array.from({ length: count }, () => 50), 320)
    expect(bars).toHaveLength(count)
    expect(bars.every((bar) => bar.width >= 2)).toBe(true)
    expect(bars.every((bar) => bar.radius <= bar.width / 2)).toBe(true)
    expect(bars.every((bar, index) => index === 0 || bar.x > bars[index - 1]!.x)).toBe(true)
    expect(bars.at(-1)!.x + bars.at(-1)!.width).toBeLessThanOrEqual(320)
  })

  it.each([320, 412])('keeps first and last readouts within %i pixels', (width) => {
    for (const readoutWidth of [120, 240, width]) {
      for (const index of [0, 29]) {
        const left = resolveBarChartReadout(width, readoutWidth, index, 30)
        expect(left).toBeGreaterThanOrEqual(0)
        expect(left + readoutWidth).toBeLessThanOrEqual(width)
      }
    }
  })

  it.each([0, 50, 100])('clears each fill edge for a %i percent bar', (rate) => {
    const [bar] = resolveBarChartGeometry([rate], 100)
    expect(bar!.y).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    expect(BAR_CHART_HEIGHT - bar!.y - bar!.height).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    expect(bar!.x).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    expect(100 - bar!.x - bar!.width).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
  })

  it.each([288, 380, 1320])('clears neighbouring bars in a %i pixel plot', (width) => {
    const bars = resolveBarChartGeometry(Array.from({ length: 30 }, () => 100), width)
    for (const [index, bar] of bars.entries()) {
      const previous = bars[index - 1]
      const next = bars[index + 1]
      const fillLeft = bar.slotStart + bar.fillInsetInline
      const fillRight = bar.slotEnd - bar.fillInsetInline
      if (previous) expect(fillLeft - previous.x - previous.width).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - 0.001)
      if (next) expect(next.x - fillRight).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE - 0.001)
    }
  })

  it.each([
    { count: 53, width: 240 },
    { count: 30, width: 288 },
    { count: 240, width: 240 },
    { count: 53, width: 1 },
  ])('keeps visible feedback wider than all $count bars in $width pixels', ({ count, width }) => {
    const bars = resolveBarChartGeometry(Array.from({ length: count }, () => 100), width)
    for (const [index, bar] of bars.entries()) {
      const fillLeft = bar.slotStart + bar.fillInsetInline
      const fillRight = bar.slotEnd - bar.fillInsetInline
      expect(bar.width).toBeGreaterThan(0)
      expect(fillRight - fillLeft).toBeGreaterThan(bar.width)
      expect(fillLeft).toBeGreaterThanOrEqual(bar.slotStart)
      expect(fillRight).toBeLessThanOrEqual(bar.slotEnd)
      expect(fillLeft).toBeLessThan(bar.x)
      expect(fillRight).toBeGreaterThan(bar.x + bar.width)
      if (index > 0) expect(fillLeft).toBeGreaterThan(bars[index - 1]!.x + bars[index - 1]!.width)
      if (index + 1 < count) expect(fillRight).toBeLessThan(bars[index + 1]!.x)
    }
  })

  it('uses a four pixel stub for empty and zero days', () => {
    const bars = resolveBarChartGeometry([null, 0, 100], 320)
    expect(bars.map((bar) => bar.height)).toEqual([4, 4, 88])
    expect(stepSelection(1, 3, 'right')).toBe(2)
    expect(stepSelection(2, 3, 'right')).toBe(0)
    expect(stepSelection(2, 3, 'home')).toBe(0)
  })
})

describe('completion series', () => {
  it('formats date-only values in the supplied locale', () => {
    const series = { granularity: 'day' as const, points: [
      { startDate: '2026-09-01', endDate: '2026-09-01', scheduled: 2, completed: 1, completionRate: 50 },
      { startDate: '2026-09-02', endDate: '2026-09-02', scheduled: 0, completed: 0, completionRate: null },
    ] }
    const points = mapCompletionSeries(series, 'pt-BR')
    expect(points[0]!.dateLabel).toContain('set')
    expect(points[0]!.readoutDateLabel).toContain('ter.')
    expect(resolveBarChartSelection(points, null, new Date(2026, 8, 1))).toBe(0)
    expect(resolveBarChartSelection(points, null, new Date(2026, 8, 3))).toBe(1)
    expect(resolveBarChartSelection(points, points[0]!.startDate, new Date(2026, 8, 2))).toBe(0)
    expect(points[1]!.rate).toBeNull()
  })

  it('labels a partial final week with both local dates', () => {
    const series = { granularity: 'week' as const, points: [
      { startDate: '2026-09-28', endDate: '2026-09-30', scheduled: 2, completed: 1, completionRate: 50 },
    ] }
    const [point] = mapCompletionSeries(series, 'pt-BR')
    expect(point?.dateLabel).toContain('28 de set')
    expect(point?.dateLabel).toContain('30 de set')
    expect(point?.readoutDateLabel).toContain('seg.')
    expect(point?.readoutDateLabel).toContain('qua.')
    expect(resolveBarChartSelection([point!], null, new Date(2026, 8, 29))).toBe(0)
  })
})
