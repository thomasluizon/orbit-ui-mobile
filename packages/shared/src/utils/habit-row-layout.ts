import { PADDING, SECONDARY_TEXT_SIZE, SHELL_CONTENT_MAX_WIDTH, SPACING, TOUCH_TARGET_MIN } from '../theme'

export function getHabitInlineDepthLimit(windowWidth: number, fontScale = 1, contentWidth = Math.min(windowWidth, SHELL_CONTENT_MAX_WIDTH) - 2 * PADDING.screenGutter): number {
  const titleWidth = Math.max(SPACING.s24, SECONDARY_TEXT_SIZE * fontScale)
  const reservedWidth = SPACING.s8 + TOUCH_TARGET_MIN + SPACING.s12 + SPACING.s4 +
    3 * TOUCH_TARGET_MIN + 3 * SPACING.s4 + titleWidth
  return Math.max(0, Math.floor((contentWidth - reservedWidth) / SPACING.s16))
}

/**
 * Width of the inert spacer that keeps a habit row's controls strip at its normal width while selection is on.
 * Outside selection the trailing group is the check, then the overflow menu after an 8px gap when the row has one.
 * In selection the selection checkbox, after the 4px strip gap, takes the place of the check.
 */
export function getHabitRowSelectionSpacerWidth(hasMenu: boolean, hasSelectionCheckbox: boolean): number {
  const trailingWidth = hasMenu ? TOUCH_TARGET_MIN + SPACING.s8 + TOUCH_TARGET_MIN : TOUCH_TARGET_MIN
  return Math.max(0, hasSelectionCheckbox ? trailingWidth - TOUCH_TARGET_MIN - SPACING.s4 : trailingWidth)
}
