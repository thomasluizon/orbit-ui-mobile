import { describe, expect, it } from 'vitest'
import { contrastOnSurface, withAlpha } from './contrast'
import { schemes } from '../theme/color-schemes'
import {
  neutralColors,
  selectionAlpha,
  statusConstants,
} from '../theme/neutral-ramp'
import { resolveResponsiveTypeRole, responsiveTypeRoles, typeRoles } from '../theme/type-roles'
import type { ColorScheme } from '../theme/types'

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

/** WHY: both ExpiryWarning mirrors paint their text on the overdue token at this alpha over --bg. */
const EXPIRY_TINT_ALPHA = 0.1
/** WHY: the native high-conflict warning paints bad status text on this status-bad tint inside a card. */
const BAD_WARNING_TINT_ALPHA = 0x1A / 0xFF

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

const EMPTY_TRACK_SURFACES = {
  dark: [
    { name: 'canvas', layers: [neutralColors.dark.bg] },
    { name: 'card', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard] },
    { name: 'well or overlay', layers: [neutralColors.dark.bg, neutralColors.dark.bgWell] },
    { name: 'card replacement hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgHover] },
    { name: 'card child hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard, neutralColors.dark.bgHover] },
    {
      name: 'canvas selection',
      layers: [
        neutralColors.dark.bg,
        withAlpha(schemes.orange.accent.dark.primary, selectionAlpha.dark),
      ],
    },
    {
      name: 'card selection',
      layers: [
        neutralColors.dark.bg,
        neutralColors.dark.bgCard,
        withAlpha(schemes.orange.accent.dark.primary, selectionAlpha.dark),
      ],
    },
  ],
  light: [
    { name: 'canvas', layers: [neutralColors.light.bg] },
    { name: 'card or overlay', layers: [neutralColors.light.bg, neutralColors.light.bgCard] },
    { name: 'well', layers: [neutralColors.light.bg, neutralColors.light.bgWell] },
    { name: 'card replacement hover', layers: [neutralColors.light.bg, neutralColors.light.bgHover] },
    { name: 'card child hover', layers: [neutralColors.light.bg, neutralColors.light.bgCard, neutralColors.light.bgHover] },
    {
      name: 'canvas selection',
      layers: [
        neutralColors.light.bg,
        withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light),
      ],
    },
    {
      name: 'card selection',
      layers: [
        neutralColors.light.bg,
        neutralColors.light.bgCard,
        withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light),
      ],
    },
  ],
} as const

const BAD_TEXT_SURFACES = {
  dark: [
    { name: 'canvas', layers: [neutralColors.dark.bg] },
    { name: 'card', layers: [neutralColors.dark.bg, neutralColors.dark.bgCard] },
    { name: 'field', layers: [neutralColors.dark.bg, neutralColors.dark.bgField] },
    { name: 'well', layers: [neutralColors.dark.bg, neutralColors.dark.bgWell] },
    { name: 'elevated sheet', layers: [neutralColors.dark.bg, neutralColors.dark.bgElev] },
    { name: 'elevated inline step', layers: [neutralColors.dark.bg, neutralColors.dark.bgElev2] },
    { name: 'canvas hover', layers: [neutralColors.dark.bg, neutralColors.dark.bgHover] },
    {
      name: 'elevated menu item hover',
      layers: [neutralColors.dark.bg, neutralColors.dark.bgElev, neutralColors.dark.bgHover],
    },
    {
      name: 'bad warning tint inside a card',
      layers: [
        neutralColors.dark.bg,
        neutralColors.dark.bgCard,
        withAlpha(statusConstants.dark.bad, BAD_WARNING_TINT_ALPHA),
      ],
    },
  ],
  light: [
    { name: 'canvas', layers: [neutralColors.light.bg] },
    {
      name: 'card, field, or elevated sheet',
      layers: [neutralColors.light.bg, neutralColors.light.bgCard],
    },
    { name: 'well', layers: [neutralColors.light.bg, neutralColors.light.bgWell] },
    { name: 'canvas hover', layers: [neutralColors.light.bg, neutralColors.light.bgHover] },
    {
      name: 'elevated menu item hover',
      layers: [neutralColors.light.bg, neutralColors.light.bgElev, neutralColors.light.bgHover],
    },
    {
      name: 'bad warning tint inside a card',
      layers: [
        neutralColors.light.bg,
        neutralColors.light.bgCard,
        withAlpha(statusConstants.light.bad, BAD_WARNING_TINT_ALPHA),
      ],
    },
  ],
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
      bgHover: 'rgba(250,250,250,0.13)',
      bgSunk: 'rgba(0,0,0,0.28)',
      hairline: 'rgba(255,255,255,0.08)',
      borderControl: 'rgba(255,255,255,0.08)',
      hairlineGhost: 'rgba(255,255,255,0.10)',
      hairlineStrong: 'rgba(255,255,255,0.16)',
      fg1: '#F4F4F6',
      fg2: '#C9C9CC',
      fg3: '#8F8F93',
      fg4: '#5D5D60',
      trackEmpty: '#7A7A7D',
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
      trackEmpty: '#7F7F83',
      scrim: 'rgba(0,0,0,0.55)',
    })
  })

  it('keeps the documented status and selection values', () => {
    expect(statusConstants.dark).toEqual({
      overdue: '#FE9A00', bad: '#FB2C36', overdueText: '#FE9A00',
      badText: '#FF7970', fgOnBad: '#020618', fgOnOverdue: '#020618',
    })
    expect(statusConstants.light).toEqual({
      overdue: '#886100', bad: '#E7000B', overdueText: '#886100',
      badText: '#D70009', fgOnBad: '#FFFFFF', fgOnOverdue: '#FFFFFF',
    })
    expect(selectionAlpha).toEqual({ dark: 0.32, light: 0.18 })
  })

  for (const mode of ['dark', 'light'] as const) {
    for (const surface of BAD_TEXT_SURFACES[mode]) {
      it(`keeps the ${mode} bad status text at the text floor on ${surface.name}`, () => {
        expect(contrastOnSurface(statusConstants[mode].badText, surface.layers))
          .toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it.each([
    ['dark', '#FB2C36', '#020618'],
    ['light', '#E7000B', '#FFFFFF'],
  ] as const)('keeps the %s destructive fill and its foreground unchanged', (mode, fill, foreground) => {
    expect(statusConstants[mode].bad).toBe(fill)
    expect(statusConstants[mode].fgOnBad).toBe(foreground)
    expect(contrastOnSurface(foreground, [fill])).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['canvas', [neutralColors.light.bg]],
    ['card', [neutralColors.light.bg, neutralColors.light.bgCard]],
    ['well', [neutralColors.light.bg, neutralColors.light.bgWell]],
    ['hover', [neutralColors.light.bg, neutralColors.light.bgHover]],
    ['session-expiry warning tint', [
      neutralColors.light.bg,
      withAlpha(statusConstants.light.overdue, EXPIRY_TINT_ALPHA),
    ]],
  ] as const)('keeps light overdue text AA on the %s surface', (_surface, layers) => {
    expect(contrastOnSurface(statusConstants.light.overdueText, layers))
      .toBeGreaterThanOrEqual(4.5)
  })

  for (const mode of ['dark', 'light'] as const) {
    for (const surface of EMPTY_TRACK_SURFACES[mode]) {
      it(`keeps the ${mode} empty track at the non-text floor on ${surface.name}`, () => {
        expect(contrastOnSurface(neutralColors[mode].trackEmpty, surface.layers))
          .toBeGreaterThanOrEqual(3)
      })
    }

    it(`keeps the ${mode} card neutral ramp ordered around the empty track`, () => {
      const colors = neutralColors[mode]
      const card = [colors.bg, colors.bgCard]
      const ratios = [colors.fg1, colors.fg2, colors.fg3, colors.trackEmpty, colors.fg4]
        .map((color) => contrastOnSurface(color, card))

      for (let index = 1; index < ratios.length; index += 1) {
        expect(ratios[index - 1]).toBeGreaterThan(ratios[index]!)
      }
    })
  }
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
