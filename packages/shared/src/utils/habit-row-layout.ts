import { PADDING, SECONDARY_TEXT_SIZE, SHELL_CONTENT_MAX_WIDTH, SPACING, TOUCH_TARGET_MIN } from '../theme'

export function getHabitInlineDepthLimit(windowWidth: number, fontScale = 1, contentWidth = Math.min(windowWidth, SHELL_CONTENT_MAX_WIDTH) - 2 * PADDING.screenGutter): number {
  const titleWidth = Math.max(SPACING.s24, SECONDARY_TEXT_SIZE * fontScale)
  const reservedWidth = SPACING.s8 + TOUCH_TARGET_MIN + SPACING.s12 + SPACING.s4 +
    3 * TOUCH_TARGET_MIN + 3 * SPACING.s4 + titleWidth
  return Math.max(0, Math.floor((contentWidth - reservedWidth) / SPACING.s16))
}

/** The gap between the tokens of a habit row's metadata strip. Both strips render it and the fit rule counts it. */
export const HABIT_ROW_META_TOKEN_GAP = SPACING.s4

function isNextDueToken(token: string | { kind: string }): boolean {
  return typeof token !== 'string' && token.kind === 'future'
}

/**
 * The visible metadata of a habit row. A row that shows its next due token (a logged parent) moves it
 * to the end; every other row drops it, because it keeps the label for screen readers only.
 */
export function visibleHabitRowMetaTokens<Token extends string | { kind: string }>(tokens: readonly Token[], nextDueVisible: boolean): Token[] {
  const others = tokens.filter((token) => !isNextDueToken(token))
  return nextDueVisible ? [...others, ...tokens.filter(isNextDueToken)] : others
}

/**
 * Whether a habit row's metadata moves to the supporting line: one token is wider than the title column,
 * or, with `fitWholeStrip` (a logged parent), the whole strip and its gaps are.
 */
export function habitRowMetaNeedsSupportingLine(tokenWidths: readonly number[], available: number, fitWholeStrip: boolean): boolean {
  const stripWidth = tokenWidths.reduce((total, width) => total + width, 0) + HABIT_ROW_META_TOKEN_GAP * Math.max(tokenWidths.length - 1, 0)
  return tokenWidths.some((width) => width > available) || (fitWholeStrip && stripWidth > available)
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
