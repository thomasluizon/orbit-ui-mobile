import { describe, expect, it } from 'vitest'
import { nearestBarIndex, resolveBarChartGeometry, stepSelection } from '../contracts/display'
import { mapCompletionSeries } from '../utils/completion-series'

describe('bar chart geometry', () => {
  it.each([1, 7, 30, 53])('lays out %i ordered bars inside 320 pixels', (count) => {
    const bars = resolveBarChartGeometry(Array.from({ length: count }, () => 50), 320)
    expect(bars).toHaveLength(count)
    expect(bars.every((bar) => bar.width >= 2)).toBe(true)
    expect(bars.every((bar, index) => index === 0 || bar.x > bars[index - 1]!.x)).toBe(true)
    expect(bars.at(-1)!.x + bars.at(-1)!.width).toBeLessThanOrEqual(320)
  })

  it('selects the bar owning any position in its slot', () => {
    const bars = resolveBarChartGeometry([0, 25, 50, 75, 100], 320)
    bars.forEach((bar, index) => {
      expect(nearestBarIndex(bar.slotStart, bars)).toBe(index)
      expect(nearestBarIndex(bar.slotEnd - 0.01, bars)).toBe(index)
    })
  })

  it('uses a four pixel stub for empty and zero days', () => {
    const bars = resolveBarChartGeometry([null, 0, 100], 320)
    expect(bars.map((bar) => bar.height)).toEqual([4, 4, 96])
    expect(stepSelection(1, 3, 'right')).toBe(2)
    expect(stepSelection(2, 3, 'right')).toBe(2)
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
    expect(points[1]!.rate).toBeNull()
  })
})
