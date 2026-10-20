import { describe, expect, it } from 'vitest'
import { isCalendarGridScrollMovement } from '../utils'

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
