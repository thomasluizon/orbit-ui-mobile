import { PADDING, SHELL_CONTENT_MAX_WIDTH, SPACING, TOUCH_TARGET_MIN } from '../theme'

export function getHabitInlineDepthLimit(windowWidth: number): number {
  const rowWidth = Math.min(windowWidth, SHELL_CONTENT_MAX_WIDTH) - 2 * PADDING.screenGutter
  const reservedWidth = SPACING.s8 + TOUCH_TARGET_MIN + SPACING.s12 + SPACING.s4 +
    3 * TOUCH_TARGET_MIN + 3 * SPACING.s4 + SPACING.s24
  return Math.max(0, Math.floor((rowWidth - reservedWidth) / SPACING.s16))
}
