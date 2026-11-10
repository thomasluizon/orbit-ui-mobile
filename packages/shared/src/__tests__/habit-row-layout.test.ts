import { describe, expect, it } from 'vitest'
import { SPACING, TOUCH_TARGET_MIN } from '../theme'
import { getHabitRowSelectionSpacerWidth } from '../utils'

describe('getHabitRowSelectionSpacerWidth', () => {
  const check = TOUCH_TARGET_MIN
  const menu = TOUCH_TARGET_MIN
  const selectionCheckbox = TOUCH_TARGET_MIN

  it('fills the trailing group less the selection checkbox and its strip gap when the row has a menu', () => {
    expect(getHabitRowSelectionSpacerWidth(true, true)).toBe(check + SPACING.s8 + menu - selectionCheckbox - SPACING.s4)
    expect(getHabitRowSelectionSpacerWidth(true, true)).toBe(52)
  })

  it('needs no spacer when the selection checkbox and its strip gap already cover the check', () => {
    expect(getHabitRowSelectionSpacerWidth(false, true)).toBe(0)
  })

  it('fills the whole trailing group when the row has no selection checkbox', () => {
    expect(getHabitRowSelectionSpacerWidth(true, false)).toBe(check + SPACING.s8 + menu)
    expect(getHabitRowSelectionSpacerWidth(false, false)).toBe(check)
  })
})
