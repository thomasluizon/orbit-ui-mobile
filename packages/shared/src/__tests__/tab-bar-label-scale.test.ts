import { expect, it } from 'vitest'
import { TAB_BAR_LABEL_MAX_FONT_SCALE } from '../contracts/navigation'

it('lets a 12/16 tab label grow to whole pixels and stops it before other labels wrap', () => {
  expect(TAB_BAR_LABEL_MAX_FONT_SCALE).toBeGreaterThan(1)
  expect(TAB_BAR_LABEL_MAX_FONT_SCALE).toBeLessThan(1.3)
  expect([12, 16].map((size) => Number.isInteger(size * TAB_BAR_LABEL_MAX_FONT_SCALE))).toEqual([true, true])
})
