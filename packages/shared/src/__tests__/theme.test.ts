import { describe, it, expect } from 'vitest'
import { schemes, colorSchemeOptions } from '../theme/color-schemes'
import {
  alphaSurfaces,
  resolveDarkNeutrals,
  resolveLightNeutrals,
  selectionAlpha,
  statusConstants,
} from '../theme/neutral-ramp'
import { typeRoles } from '../theme/type-roles'
import type { ColorScheme } from '../theme/types'

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

const HEX = /^#[0-9a-f]{6}$/

describe('color schemes', () => {
  it('has all 6 color schemes', () => {
    expect(Object.keys(schemes)).toHaveLength(6)
    for (const name of ALL_SCHEMES) {
      expect(schemes[name]).toBeDefined()
    }
  })

  it('has the handoff accent literals (dark)', () => {
    expect(schemes.purple.accent.dark).toEqual({
      primary: '#7f46f7', primaryPressed: '#631df2', primaryRgb: '127, 70, 247',
    })
    expect(schemes.blue.accent.dark.primary).toBe('#2b7fff')
    expect(schemes.green.accent.dark.primary).toBe('#00c950')
    expect(schemes.rose.accent.dark.primary).toBe('#ff2056')
    expect(schemes.orange.accent.dark.primary).toBe('#ff6900')
    expect(schemes.cyan.accent.dark.primary).toBe('#00b8db')
  })

  it('has the handoff accent literals (light)', () => {
    expect(schemes.purple.accent.light).toEqual({
      primary: '#631df2', primaryPressed: '#510fd3', primaryRgb: '99, 29, 242',
    })
    expect(schemes.blue.accent.light.primary).toBe('#155dfc')
    expect(schemes.green.accent.light.primary).toBe('#00a63e')
    expect(schemes.rose.accent.light.primary).toBe('#ec003f')
    expect(schemes.orange.accent.light.primary).toBe('#f54900')
    expect(schemes.cyan.accent.light.primary).toBe('#0092b8')
  })

  for (const name of ALL_SCHEMES) {
    it(`${name}: primaryRgb matches the primary hex per mode`, () => {
      for (const mode of ['dark', 'light'] as const) {
        const { primary, primaryRgb } = schemes[name].accent[mode]
        const fromRgb = primaryRgb
          .split(',')
          .map(part => Number(part.trim()).toString(16).padStart(2, '0'))
          .join('')
        expect(`#${fromRgb}`).toBe(primary)
      }
    })

    it(`${name}: gradient header stops are valid hexes`, () => {
      expect(schemes[name].gradientHeaderFrom.dark).toMatch(HEX)
      expect(schemes[name].gradientHeaderFrom.light).toMatch(HEX)
    })
  }
})

describe('neutral ramp resolution', () => {
  it('purple dark resolves byte-exact to the handoff slate palette', () => {
    expect(resolveDarkNeutrals('purple')).toEqual({
      bg: '#020618',
      fg1: '#f8fafc',
      fg2: '#cad5e2',
      fg3: '#90a1b9',
      fg4: '#62748e',
    })
  })

  it('purple light resolves byte-exact to the handoff light palette', () => {
    expect(resolveLightNeutrals('purple')).toEqual({
      bg: '#f8fafc',
      bgSunk: '#f1f5f9',
      fg1: '#0f172b',
      fg2: '#314158',
      fg3: '#62748e',
      fg4: '#90a1b9',
    })
  })

  it('purple gradient header stops equal the handoff literals', () => {
    expect(schemes.purple.gradientHeaderFrom.dark).toBe('#22094f')
    expect(schemes.purple.gradientHeaderFrom.light).toBe('#e9d4ff')
  })

  for (const name of ALL_SCHEMES) {
    it(`${name}: all neutrals resolve to valid hexes in both modes`, () => {
      const dark = resolveDarkNeutrals(name)
      const light = resolveLightNeutrals(name)
      for (const value of [...Object.values(dark), ...Object.values(light)]) {
        expect(value).toMatch(HEX)
      }
      expect(dark.bg).not.toBe(light.bg)
    })
  }
})

describe('alpha surfaces and status constants', () => {
  it('dark alpha surfaces are the handoff white-alpha constants', () => {
    expect(alphaSurfaces.dark).toEqual({
      bgElev: 'rgba(248, 250, 252, 0.06)',
      bgElev2: 'rgba(248, 250, 252, 0.10)',
      bgSunk: 'rgba(0, 0, 0, 0.28)',
      hairline: 'rgba(248, 250, 252, 0.10)',
      hairlineStrong: 'rgba(248, 250, 252, 0.18)',
      statusEmpty: 'rgba(248, 250, 252, 0.22)',
    })
  })

  it('light cards are opaque white with ink-alpha hairlines', () => {
    expect(alphaSurfaces.light.bgElev).toBe('rgb(255, 255, 255)')
    expect(alphaSurfaces.light.bgElev2).toBe('rgb(255, 255, 255)')
    expect(alphaSurfaces.light.hairline).toBe('rgba(2, 6, 24, 0.08)')
    expect(alphaSurfaces.light.hairlineStrong).toBe('rgba(2, 6, 24, 0.16)')
    expect(alphaSurfaces.light.statusEmpty).toBe('rgba(2, 6, 24, 0.18)')
  })

  it('status constants match the handoff per mode', () => {
    expect(statusConstants.dark).toEqual({ overdue: '#fe9a00', bad: '#fb2c36', frozen: '#00d3f3' })
    expect(statusConstants.light).toEqual({ overdue: '#e17100', bad: '#e7000b', frozen: '#0092b8' })
  })

  it('selection alphas match the handoff', () => {
    expect(selectionAlpha).toEqual({ dark: 0.32, light: 0.18 })
  })
})

describe('type roles', () => {
  it('defines the 11 semantic roles', () => {
    expect(Object.keys(typeRoles)).toEqual([
      'eyebrow', 'display', 'hero', 'h1', 'h2', 'row',
      'body', 'secondary', 'meta', 'num', 'numXl',
    ])
  })

  it('families follow the handoff assignments', () => {
    expect(typeRoles.hero.family).toBe('display')
    expect(typeRoles.numXl.family).toBe('display')
    expect(typeRoles.meta.family).toBe('mono')
    expect(typeRoles.num.family).toBe('mono')
    expect(typeRoles.body.family).toBe('sans')
  })

  it('weight scale is squashed to 400-700', () => {
    for (const role of Object.values(typeRoles)) {
      expect([400, 500, 600, 700]).toContain(role.weight)
    }
  })
})

describe('colorSchemeOptions', () => {
  it('has 6 options in canonical order with the new dark primaries', () => {
    expect(colorSchemeOptions).toEqual([
      { value: 'purple', color: '#7f46f7' },
      { value: 'blue', color: '#2b7fff' },
      { value: 'green', color: '#00c950' },
      { value: 'rose', color: '#ff2056' },
      { value: 'orange', color: '#ff6900' },
      { value: 'cyan', color: '#00b8db' },
    ])
  })

  it('option colors match scheme dark primaries', () => {
    for (const option of colorSchemeOptions) {
      expect(option.color).toBe(schemes[option.value].accent.dark.primary)
    }
  })
})
