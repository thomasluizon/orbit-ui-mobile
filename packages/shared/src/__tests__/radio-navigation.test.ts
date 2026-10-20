import { expect, it } from 'vitest'
import { getRadioNavigationIndex } from '../utils/radio-navigation'

it('wraps arrow navigation and ignores keys with no radio action', () => {
  expect(getRadioNavigationIndex('ArrowRight', 2, 3)).toBe(0)
  expect(getRadioNavigationIndex('ArrowLeft', 0, 3)).toBe(2)
  expect(getRadioNavigationIndex('Home', 2, 3)).toBe(0)
  expect(getRadioNavigationIndex('End', 0, 3)).toBe(2)
  expect(getRadioNavigationIndex('Enter', 0, 3)).toBeNull()
  expect(getRadioNavigationIndex('ArrowRight', 0, 0)).toBeNull()
})
