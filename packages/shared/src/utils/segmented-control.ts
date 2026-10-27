import { TOUCH_TARGET_MIN } from '../theme/breakpoints'

export function getSegmentedControlLayout(wordWidths: readonly (readonly number[])[], availableWidth: number, labelInset: number): { minimumWidths: number[]; folded: boolean } {
  const minimumWidths = wordWidths.map((widths) => Math.max(TOUCH_TARGET_MIN, labelInset + Math.max(...widths)))
  const requiredWidth = minimumWidths.reduce((sum, width) => sum + width, 8 + 4 * (minimumWidths.length - 1))
  return { minimumWidths, folded: availableWidth > 0 && requiredWidth > availableWidth }
}
