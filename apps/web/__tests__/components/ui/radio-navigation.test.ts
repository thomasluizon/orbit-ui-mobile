import { describe, expect, it } from 'vitest'
import { getRadioNavigationIndex } from '@/components/ui/radio-navigation'

describe('getRadioNavigationIndex', () => {
  it('moves through radio options with wrapping arrow navigation', () => {
    expect(getRadioNavigationIndex('ArrowDown', 0, 4)).toBe(1)
    expect(getRadioNavigationIndex('ArrowRight', 3, 4)).toBe(0)
    expect(getRadioNavigationIndex('ArrowUp', 0, 4)).toBe(3)
    expect(getRadioNavigationIndex('ArrowLeft', 2, 4)).toBe(1)
  })

  it('moves to either end and ignores unrelated keys', () => {
    expect(getRadioNavigationIndex('Home', 2, 4)).toBe(0)
    expect(getRadioNavigationIndex('End', 1, 4)).toBe(3)
    expect(getRadioNavigationIndex('Enter', 1, 4)).toBeNull()
    expect(getRadioNavigationIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
