import { describe, expect, it } from 'vitest'
import { schemes } from '../theme/color-schemes'
import { hoverForeground, neutralColors, statusConstants } from '../theme/neutral-ramp'
import { contrastOnSurface } from './contrast'

const foregrounds = [
  ['muted text', neutralColors.light.fg3],
  ['destructive text', statusConstants.light.badText],
  ['overdue text', statusConstants.light.overdueText],
  ['raised accent text', schemes.orange.accent.light.primaryText],
  ['canvas accent text', schemes.orange.accent.light.primarySoft],
] as const

describe('light hover foregrounds', () => {
  for (const surface of [neutralColors.light.bg, neutralColors.light.bgElev]) {
    it.each(foregrounds)('keeps %s readable over ' + surface, (_role, restingColor) => {
      const layers = [surface, neutralColors.light.bgHover]
      expect(contrastOnSurface(hoverForeground('light', restingColor, true), layers))
        .toBeGreaterThanOrEqual(4.5)
      expect(hoverForeground('light', restingColor, false)).toBe(restingColor)
      expect(hoverForeground('dark', restingColor, true)).toBe(restingColor)
    })
  }
})
