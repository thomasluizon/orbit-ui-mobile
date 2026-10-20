import { describe, expect, it } from 'vitest'
import { isCalendarGridScrollMovement, resolveCalendarGridOpeningScroll } from '../utils'

describe('calendar grid opening position', () => {
  it.each([192, 192.25, 384].flatMap((columnWidth) => [224, 284, 504, 1000, 1600].flatMap((viewportWidth) => Array.from({ length: 7 }, (_, todayIndex) => ({ columnWidth, viewportWidth, todayIndex })))))('aligns a column boundary nearest the centered day ($columnWidth, $viewportWidth, today=$todayIndex)', ({ columnWidth, viewportWidth, todayIndex }) => {
    const { left, trailingSpace } = resolveCalendarGridOpeningScroll(todayIndex, columnWidth, viewportWidth, 7)
    expect(left / columnWidth).toBe(Math.round(left / columnWidth))
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + viewportWidth).toBeLessThanOrEqual(Math.max(viewportWidth, 7 * columnWidth + trailingSpace))
    if (viewportWidth >= columnWidth) {
      expect(todayIndex * columnWidth - left).toBeGreaterThanOrEqual(0)
      expect((todayIndex + 1) * columnWidth - left).toBeLessThanOrEqual(viewportWidth)
    } else expect(left).toBe(todayIndex * columnWidth)
    const centered = Math.max(0, Math.min(7 * columnWidth - viewportWidth, todayIndex * columnWidth - (viewportWidth - columnWidth) / 2))
    const candidates = Array.from({ length: todayIndex + 1 }, (_, index) => index * columnWidth)
      .filter((offset) => (todayIndex + 1) * columnWidth - offset <= Math.max(viewportWidth, columnWidth))
    expect(Math.abs(left - centered)).toBe(Math.min(...candidates.map((offset) => Math.abs(offset - centered))))
    expect(trailingSpace).toBeGreaterThanOrEqual(0)
    expect(trailingSpace).toBeLessThan(columnWidth)
  })

  it('leaves a week without today and a fully visible week at the start', () => {
    expect(resolveCalendarGridOpeningScroll(-1, 192, 224, 7)).toEqual({ left: 0, trailingSpace: 0 })
    expect(resolveCalendarGridOpeningScroll(3, 192, 1344, 7)).toEqual({ left: 0, trailingSpace: 0 })
  })
})

describe('calendar grid scroll movement', () => {
  it.each([
    { direction: 'up', offset: 120, openingOffset: 240 },
    { direction: 'down', offset: 360, openingOffset: 240 },
  ])('recognizes a person scrolling $direction', ({ offset, openingOffset }) => {
    expect(isCalendarGridScrollMovement(offset, openingOffset, 480)).toBe(true)
  })

  it.each([0, 0.5, 1, -0.5, -1])('ignores a downward clamp %s px from maximum travel', (distance) => {
    expect(isCalendarGridScrollMovement(240 + distance, 360, 240)).toBe(false)
  })

  it.each([1.5, -1.5])('recognizes a move %s px from maximum travel', (distance) => {
    expect(isCalendarGridScrollMovement(240 + distance, 360, 240)).toBe(true)
  })

  it('recognizes an increased offset even at maximum travel', () => {
    expect(isCalendarGridScrollMovement(240, 120, 240)).toBe(true)
  })

  it.each([0, 240])('ignores an unchanged offset of %s', (offset) => {
    expect(isCalendarGridScrollMovement(offset, offset, 240)).toBe(false)
  })
})
