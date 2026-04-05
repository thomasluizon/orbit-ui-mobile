import { describe, it, expect } from 'vitest'
import { schemes, colorSchemeOptions } from '../theme/color-schemes'
import type { ColorScheme, ThemeValues, ColorSchemeDefinition } from '../theme/types'

// ===========================================================================
// Color schemes
// ===========================================================================

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

const THEME_VALUE_KEYS: (keyof ThemeValues)[] = [
  'background', 'surfaceGround', 'surface', 'surfaceElevated', 'surfaceOverlay',
  'border', 'borderMuted', 'borderEmphasis',
  'textPrimary', 'textSecondary', 'textMuted', 'textFaded', 'textInverse',
  'shadowSm', 'shadowMd', 'shadowLg', 'shadowGlow', 'shadowGlowSm', 'shadowGlowLg',
  'navGlassBg', 'navGlassBorder',
]

const SCALE_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

describe('color schemes', () => {
  it('has all 6 color schemes', () => {
    expect(Object.keys(schemes)).toHaveLength(6)
    for (const name of ALL_SCHEMES) {
      expect(schemes[name]).toBeDefined()
    }
  })

  for (const name of ALL_SCHEMES) {
    describe(`${name} scheme`, () => {
      it('has primary and primaryLight colors', () => {
        const scheme = schemes[name]
        expect(typeof scheme.primary).toBe('string')
        expect(typeof scheme.primaryLight).toBe('string')
        expect(scheme.primary).toMatch(/^#[0-9a-f]{6}$/i)
        expect(scheme.primaryLight).toMatch(/^#[0-9a-f]{6}$/i)
      })

      it('has shadowRgb', () => {
        expect(typeof schemes[name].shadowRgb).toBe('string')
        expect(schemes[name].shadowRgb.split(',').length).toBe(3)
      })

      it('has dark theme values', () => {
        const dark = schemes[name].dark
        for (const key of THEME_VALUE_KEYS) {
          expect(typeof dark[key]).toBe('string')
          expect(dark[key].length).toBeGreaterThan(0)
        }
      })

      it('has light theme values', () => {
        const light = schemes[name].light
        for (const key of THEME_VALUE_KEYS) {
          expect(typeof light[key]).toBe('string')
          expect(light[key].length).toBeGreaterThan(0)
        }
      })

      it('has all scale values (50-950)', () => {
        const scale = schemes[name].scale
        for (const step of SCALE_KEYS) {
          expect(typeof scale[step]).toBe('string')
          expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/i)
        }
      })

      it('dark and light backgrounds are different', () => {
        expect(schemes[name].dark.background).not.toBe(schemes[name].light.background)
      })
    })
  }
})

describe('colorSchemeOptions', () => {
  it('has 6 options', () => {
    expect(colorSchemeOptions).toHaveLength(6)
  })

  it('each option has value and color', () => {
    for (const option of colorSchemeOptions) {
      expect(typeof option.value).toBe('string')
      expect(typeof option.color).toBe('string')
      expect(option.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('option values match scheme keys', () => {
    const optionValues = colorSchemeOptions.map(o => o.value)
    expect(optionValues).toEqual(ALL_SCHEMES)
  })

  it('option colors match primary colors', () => {
    for (const option of colorSchemeOptions) {
      expect(option.color).toBe(schemes[option.value].primary)
    }
  })

  it('has correct order: purple, blue, green, rose, orange, cyan', () => {
    expect(colorSchemeOptions.map(o => o.value)).toEqual(
      ['purple', 'blue', 'green', 'rose', 'orange', 'cyan'],
    )
  })
})
