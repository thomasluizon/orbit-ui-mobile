import { describe, expect, it } from 'vitest'
import { SPACING, TOUCH_TARGET_MIN } from '../theme'
import { getHabitRowSelectionSpacerWidth, HABIT_ROW_META_TOKEN_GAP, habitRowMetaNeedsSupportingLine, visibleHabitRowMetaTokens } from '../utils'

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

describe('visibleHabitRowMetaTokens', () => {
  const tokens = [{ kind: 'type', label: 'Habit' }, '0 of 2', { kind: 'future', label: 'due tomorrow' }, { kind: 'checklist', label: 'Checklist, 1 of 2' }] as const

  it('moves the next due token to the end when the row shows it', () => {
    expect(visibleHabitRowMetaTokens(tokens, true)).toEqual([tokens[0], tokens[1], tokens[3], tokens[2]])
  })

  it('drops the next due token when the row keeps it for screen readers only', () => {
    expect(visibleHabitRowMetaTokens(tokens, false)).toEqual([tokens[0], tokens[1], tokens[3]])
  })

  it('keeps the order of a strip with no next due token', () => {
    const plain = ['08:00', { kind: 'overdue' }] as const
    expect([visibleHabitRowMetaTokens(plain, true), visibleHabitRowMetaTokens(plain, false)]).toEqual([[...plain], [...plain]])
  })
})

describe('habitRowMetaNeedsSupportingLine', () => {
  it('reads the 4px strip gap from the spacing scale', () => {
    expect(HABIT_ROW_META_TOKEN_GAP).toBe(SPACING.s4)
  })

  it('moves the metadata when one token is wider than the title column, with or without the whole strip rule', () => {
    expect([habitRowMetaNeedsSupportingLine([40, 121], 120, false), habitRowMetaNeedsSupportingLine([40, 121], 120, true)]).toEqual([true, true])
  })

  it('moves the metadata of a logged parent when the strip and its gaps are wider than the title column', () => {
    const widths = [40, 38, 38]
    const strip = 40 + 38 + 38 + 2 * HABIT_ROW_META_TOKEN_GAP
    expect({
      fits: habitRowMetaNeedsSupportingLine(widths, strip, true),
      overflowsByOne: habitRowMetaNeedsSupportingLine(widths, strip - 1, true),
      otherRowWraps: habitRowMetaNeedsSupportingLine(widths, strip - 1, false),
    }).toEqual({ fits: false, overflowsByOne: true, otherRowWraps: false })
  })

  it('keeps the metadata inline before a measurement arrives', () => {
    expect([habitRowMetaNeedsSupportingLine([], Infinity, true), habitRowMetaNeedsSupportingLine([0, 0], Infinity, true)]).toEqual([false, false])
  })
})
