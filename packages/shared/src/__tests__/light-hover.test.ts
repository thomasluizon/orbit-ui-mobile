import { describe, expect, it } from 'vitest'
import { schemes } from '../theme/color-schemes'
import { hoverForeground, neutralColors, statusConstants } from '../theme/neutral-ramp'
import { contrastOnSurface } from './contrast'
import { lightHoverTextSurfaces } from './light-hover-surfaces'

const coloredForegrounds = [
  ['destructive text', statusConstants.light.badText],
  ['overdue text', statusConstants.light.overdueText],
  ['raised accent text', schemes.orange.accent.light.primaryText],
] as const

describe('light hover foregrounds', () => {
  for (const { name, layers } of lightHoverTextSurfaces) {
    it.each(coloredForegrounds)('keeps %s readable on ' + name, (_role, restingColor) => {
      expect(contrastOnSurface(restingColor, layers)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it.each(coloredForegrounds)('preserves %s under hover and press', (_role, restingColor) => {
    expect(hoverForeground('light', restingColor, true)).toBe(restingColor)
    expect(hoverForeground('light', restingColor, false)).toBe(restingColor)
    expect(hoverForeground('dark', restingColor, true)).toBe(restingColor)
  })

  it('promotes only muted text under a light hover or press', () => {
    expect(hoverForeground('light', neutralColors.light.fg3, true)).toBe(neutralColors.light.fg2)
    expect(hoverForeground('light', neutralColors.light.fg3, false)).toBe(neutralColors.light.fg3)
    expect(hoverForeground('dark', neutralColors.dark.fg3, true)).toBe(neutralColors.dark.fg3)
    for (const { layers } of lightHoverTextSurfaces) {
      expect(contrastOnSurface(neutralColors.light.fg2, layers)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
