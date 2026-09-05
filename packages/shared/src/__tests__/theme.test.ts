import { describe, expect, it } from 'vitest'
import { schemes } from '../theme/color-schemes'
import {
  neutralColors,
  selectionAlpha,
  statusConstants,
} from '../theme/neutral-ramp'
import { resolveResponsiveTypeRole, responsiveTypeRoles, typeRoles } from '../theme/type-roles'
import type { ColorScheme } from '../theme/types'

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

const GRANTED_ACCENTS = {
  dark: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C85716',
    primaryDim: '#261611',
    primaryRgb: '196,83,15',
  },
  light: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C15109',
    primaryDim: '#F4DDD3',
    primaryRgb: '196,83,15',
  },
} as const

describe('color schemes', () => {
  it('keeps all 6 contract values during the API overlap', () => {
    expect(Object.keys(schemes)).toHaveLength(6)
    for (const name of ALL_SCHEMES) expect(schemes[name]).toBeDefined()
  })

  for (const name of ALL_SCHEMES) {
    it(`${name}: resolves the granted accent in both modes`, () => {
      expect(schemes[name].accent).toEqual(GRANTED_ACCENTS)
      expect(schemes[name].fgOnPrimary).toEqual({ dark: '#FFFFFF', light: '#FFFFFF' })
    })

  }
})

describe('byte-exact mode colors', () => {
  it('matches the dark DESIGN.md table', () => {
    expect(neutralColors.dark).toEqual({
      bg: '#09090B',
      bgCard: 'rgba(250,250,250,0.04)',
      bgField: 'rgba(250,250,250,0.06)',
      bgWell: 'rgba(250,250,250,0.08)',
      bgElev: '#1C1C1E',
      bgElev2: 'rgba(250,250,250,0.12)',
      bgHover: 'rgba(250,250,250,0.14)',
      bgSunk: 'rgba(0,0,0,0.28)',
      hairline: 'rgba(255,255,255,0.08)',
      borderControl: 'rgba(255,255,255,0.08)',
      hairlineGhost: 'rgba(255,255,255,0.10)',
      hairlineStrong: 'rgba(255,255,255,0.16)',
      fg1: '#F4F4F6',
      fg2: '#C9C9CC',
      fg3: '#8F8F93',
      fg4: '#5D5D60',
      scrim: 'rgba(0,0,0,0.55)',
    })
  })

  it('matches the light DESIGN.md table', () => {
    expect(neutralColors.light).toEqual({
      bg: '#FAFAFA',
      bgCard: '#FFFFFF',
      bgField: '#FFFFFF',
      bgWell: 'rgba(9,9,11,0.04)',
      bgElev: '#FFFFFF',
      bgElev2: '#FFFFFF',
      bgHover: 'rgba(9,9,11,0.06)',
      bgSunk: 'rgba(9,9,11,0.04)',
      hairline: 'rgba(9,9,11,0.08)',
      borderControl: 'rgba(9,9,11,0.08)',
      hairlineGhost: 'rgba(9,9,11,0.10)',
      hairlineStrong: 'rgba(9,9,11,0.16)',
      fg1: '#1A1A1D',
      fg2: '#424247',
      fg3: '#68686D',
      fg4: '#89898D',
      scrim: 'rgba(0,0,0,0.55)',
    })
  })

  it('keeps the documented status and selection values', () => {
    expect(statusConstants.dark).toEqual({
      overdue: '#FE9A00', bad: '#FB2C36', overdueText: '#FE9A00',
      badText: '#FB2C36', fgOnBad: '#020618', fgOnOverdue: '#020618',
    })
    expect(statusConstants.light).toEqual({
      overdue: '#946A00', bad: '#E7000B', overdueText: '#946A00',
      badText: '#E7000B', fgOnBad: '#FFFFFF', fgOnOverdue: '#FFFFFF',
    })
    expect(selectionAlpha).toEqual({ dark: 0.32, light: 0.18 })
  })
})

describe('type roles', () => {
  it('encodes the Pro drawing heading and allowance pairs', () => {
    expect(responsiveTypeRoles).toEqual({
      displayHeading: {
        family: 'display', weight: 500, letterSpacingEm: -0.02, colorToken: 'fg1',
        compact: { size: 28, lineHeight: 1.18 }, wide: { size: 34, lineHeight: 1.15 },
      },
      allowance: {
        family: 'display', weight: 600, letterSpacingEm: -0.02, colorToken: 'fg1', tabularNums: true,
        compact: { size: 34, lineHeight: 1.05 }, wide: { size: 44, lineHeight: 1.02 },
      },
    })
  })

  it.each([320, 412, 639.99, 640, 1416])('resolves both pairs at width %s', (width) => {
    const wide = width >= 640
    expect(resolveResponsiveTypeRole('displayHeading', width)).toEqual({
      family: 'display', weight: 500, letterSpacingEm: -0.02, colorToken: 'fg1',
      size: wide ? 34 : 28, lineHeight: wide ? 1.15 : 1.18,
    })
    expect(resolveResponsiveTypeRole('allowance', width)).toEqual({
      family: 'display', weight: 600, letterSpacingEm: -0.02, colorToken: 'fg1', tabularNums: true,
      size: wide ? 44 : 34, lineHeight: wide ? 1.02 : 1.05,
    })
  })

  it('defines the 11 semantic roles', () => {
    expect(Object.keys(typeRoles)).toEqual([
      'eyebrow', 'display', 'hero', 'h1', 'h2', 'row',
      'body', 'secondary', 'meta', 'num', 'numXl',
    ])
  })

  it('keeps the documented family assignments', () => {
    expect(typeRoles.hero.family).toBe('display')
    expect(typeRoles.numXl.family).toBe('display')
    expect(typeRoles.meta.family).toBe('mono')
    expect(typeRoles.num.family).toBe('mono')
    expect(typeRoles.body.family).toBe('sans')
  })
})
