import { PADDING, SECONDARY_TEXT_SIZE, SHELL_CONTENT_MAX_WIDTH, SPACING, TOUCH_TARGET_MIN } from '../theme'

export function getHabitInlineDepthLimit(windowWidth: number, fontScale = 1, contentWidth = Math.min(windowWidth, SHELL_CONTENT_MAX_WIDTH) - 2 * PADDING.screenGutter): number {
  const titleWidth = Math.max(SPACING.s24, SECONDARY_TEXT_SIZE * fontScale)
  const reservedWidth = SPACING.s8 + TOUCH_TARGET_MIN + SPACING.s12 + SPACING.s4 +
    3 * TOUCH_TARGET_MIN + 3 * SPACING.s4 + titleWidth
  return Math.max(0, Math.floor((contentWidth - reservedWidth) / SPACING.s16))
}
