import { TOUCH_TARGET_MIN } from '../theme/breakpoints'

export function getSegmentedControlLayout(wordWidths: readonly (readonly number[])[], availableWidth: number, insets: { label: number; track: number; gap: number }): { minimumWidths: number[]; folded: boolean } {
  const minimumWidths = wordWidths.map((widths) => Math.max(TOUCH_TARGET_MIN, insets.label + Math.max(...widths)))
  const requiredWidth = minimumWidths.reduce((sum, width) => sum + width, insets.track + insets.gap * (minimumWidths.length - 1))
  return { minimumWidths, folded: availableWidth > 0 && requiredWidth > availableWidth }
}
