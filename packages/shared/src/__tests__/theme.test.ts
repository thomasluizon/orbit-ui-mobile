import { describe, it, expect } from 'vitest'
import { schemes, colorSchemeOptions } from '../theme/color-schemes'
import {
  alphaSurfaces,
  resolveDarkNeutrals,
  resolveLightNeutrals,
  selectionAlpha,
  statusConstants,
} from '../theme/neutral-ramp'
import { zLayers } from '../theme/z-layers'
import { typeRoles } from '../theme/type-roles'
import type { ColorScheme, SchemeMode } from '../theme/types'

const ALL_SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

const HEX = /^#[0-9a-f]{6}$/

const relativeLuminance = (hexColor: string) => {
  const channel = (offset: number) =>
    Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  return (
    0.2126 * linear(channel(1)) +
    0.7152 * linear(channel(3)) +
    0.0722 * linear(channel(5))
  )
}
const contrastRatio = (a: string, b: string) => {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}
const canvasFor = (scheme: ColorScheme, mode: SchemeMode) =>
  mode === 'dark'
    ? resolveDarkNeutrals(scheme).bg
    : resolveLightNeutrals(scheme).bg

describe('color schemes', () => {
  it('has all 6 color schemes', () => {
    expect(Object.keys(schemes)).toHaveLength(6)
    for (const name of ALL_SCHEMES) {
      expect(schemes[name]).toBeDefined()
    }
  })

  it('has the handoff accent literals (dark)', () => {
    expect(schemes.purple.accent.dark).toEqual({
      primary: '#8659ea', primaryPressed: '#6e44d2', primaryRgb: '134, 89, 234',
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
  }

  it('has no gradient-header field (deleted in the #539 freeze)', () => {
    for (const name of ALL_SCHEMES) {
      expect(Object.keys(schemes[name]).some((key) => key.startsWith('gradient'))).toBe(false)
    }
  })
})

describe('fg-on-primary (scheme x mode AA resolution)', () => {
  const WHITE = '#ffffff'
  const INK = '#020618'

  it('keeps white where white passes 4.5:1 on the accent', () => {
    expect(schemes.purple.fgOnPrimary).toEqual({ dark: WHITE, light: WHITE })
    expect(schemes.blue.fgOnPrimary.light).toBe(WHITE)
    expect(schemes.rose.fgOnPrimary.light).toBe(WHITE)
  })

  it('flips to the locked canvas ink where white fails AA', () => {
    expect(schemes.blue.fgOnPrimary.dark).toBe(INK)
    expect(schemes.rose.fgOnPrimary.dark).toBe(INK)
    expect(schemes.green.fgOnPrimary).toEqual({ dark: INK, light: INK })
    expect(schemes.orange.fgOnPrimary).toEqual({ dark: INK, light: INK })
    expect(schemes.cyan.fgOnPrimary).toEqual({ dark: INK, light: INK })
  })

  it('every resolved value passes 4.5:1 WCAG AA on its accent', () => {
    const channel = (hexColor: string, offset: number) =>
      Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255
    const linear = (value: number) =>
      value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    const luminance = (hexColor: string) =>
      0.2126 * linear(channel(hexColor, 1)) +
      0.7152 * linear(channel(hexColor, 3)) +
      0.0722 * linear(channel(hexColor, 5))
    const contrast = (a: string, b: string) => {
      const first = luminance(a)
      const second = luminance(b)
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
    }

    for (const name of ALL_SCHEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const ratio = contrast(
          schemes[name].fgOnPrimary[mode],
          schemes[name].accent[mode].primary,
        )
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('neutral ramp resolution', () => {
  it('purple dark resolves byte-exact to the frozen (#539 b5) neutral palette', () => {
    expect(resolveDarkNeutrals('purple')).toEqual({
      bg: '#070910',
      fg1: '#f6f7f9',
      fg2: '#c7cbd2',
      fg3: '#888e99',
      fg4: '#565c67',
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
      bgCard: 'rgba(248, 250, 252, 0.04)',
      bgField: 'rgba(248, 250, 252, 0.05)',
      bgElev: 'rgba(248, 250, 252, 0.06)',
      bgElev2: 'rgba(248, 250, 252, 0.10)',
      bgSunk: 'rgba(0, 0, 0, 0.28)',
      hairline: 'rgba(248, 250, 252, 0.10)',
      hairlineGhost: 'rgba(255, 255, 255, 0.10)',
      hairlineStrong: 'rgba(248, 250, 252, 0.18)',
      statusEmpty: 'rgba(248, 250, 252, 0.22)',
    })
  })

  it('light cards are opaque white with ink-alpha hairlines', () => {
    expect(alphaSurfaces.light.bgCard).toBe('rgb(255, 255, 255)')
    expect(alphaSurfaces.light.bgElev).toBe('rgb(255, 255, 255)')
    expect(alphaSurfaces.light.bgElev2).toBe('rgb(255, 255, 255)')
    expect(alphaSurfaces.light.hairline).toBe('rgba(2, 6, 24, 0.08)')
    expect(alphaSurfaces.light.hairlineGhost).toBe('rgba(2, 6, 24, 0.10)')
    expect(alphaSurfaces.light.hairlineStrong).toBe('rgba(2, 6, 24, 0.16)')
    expect(alphaSurfaces.light.statusEmpty).toBe('rgba(2, 6, 24, 0.18)')
  })

  it('status constants match the handoff per mode', () => {
    expect(statusConstants.dark).toEqual({
      overdue: '#fe9a00',
      bad: '#fb2c36',
      frozen: '#00d3f3',
      overdueText: '#fe9a00',
      badText: '#fb2c36',
      fgOnBad: '#020618',
    })
    expect(statusConstants.light).toEqual({
      overdue: '#e17100',
      bad: '#e7000b',
      frozen: '#0092b8',
      overdueText: '#b45b00',
      badText: '#e7000b',
      fgOnBad: '#ffffff',
    })
  })

  it('status text variants equal the base except the darkened light overdue', () => {
    expect(statusConstants.dark.overdueText).toBe(statusConstants.dark.overdue)
    expect(statusConstants.dark.badText).toBe(statusConstants.dark.bad)
    expect(statusConstants.light.badText).toBe(statusConstants.light.bad)
    expect(statusConstants.light.overdueText).not.toBe(statusConstants.light.overdue)
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
      { value: 'purple', color: '#8659ea' },
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

describe('primary-soft accent-text token', () => {
  it('freezes purple to the measured bytes', () => {
    expect(schemes.purple.primarySoft.dark).toBe('#b69bf8')
    expect(schemes.purple.primarySoft.light).toBe('#631df2')
  })

  it('every scheme x mode primary-soft is a valid hex', () => {
    for (const name of ALL_SCHEMES) {
      for (const mode of ['dark', 'light'] as const) {
        expect(schemes[name].primarySoft[mode]).toMatch(HEX)
      }
    }
  })
})

describe('z-index stacking scale', () => {
  const order = [
    zLayers.dropdown,
    zLayers.sticky,
    zLayers.modalBackdrop,
    zLayers.modal,
    zLayers.tourSpotlight,
    zLayers.celebration,
    zLayers.toast,
    zLayers.tooltip,
  ]

  it('ascends strictly monotonically through the canonical tiers', () => {
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index]).toBeGreaterThan(order[index - 1])
    }
  })

  it('places the tour-spotlight carve-out above the modal (it points at modals)', () => {
    expect(zLayers.tourSpotlight).toBeGreaterThan(zLayers.modal)
  })

  it('places the celebration carve-out just below the toast, above the modal', () => {
    expect(zLayers.celebration).toBeLessThan(zLayers.toast)
    expect(zLayers.celebration).toBeGreaterThan(zLayers.modal)
    const between = order.filter(value => value > zLayers.celebration && value < zLayers.toast)
    expect(between).toHaveLength(0)
  })

  it('keeps the modal backdrop directly beneath the modal', () => {
    expect(zLayers.modalBackdrop).toBeLessThan(zLayers.modal)
  })
})

describe('accent-AA three-floor gate (per scheme x mode)', () => {
  it('floor 1: the resolved fg-on-primary label clears 4.5:1 on the accent fill', () => {
    for (const name of ALL_SCHEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const ratio = contrastRatio(
          schemes[name].fgOnPrimary[mode],
          schemes[name].accent[mode].primary,
        )
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('floor 1 (purple): white on the CTA fill clears 4.5:1', () => {
    for (const mode of ['dark', 'light'] as const) {
      expect(contrastRatio('#ffffff', schemes.purple.accent[mode].primary))
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  it('floor 2: primary as a graphic clears 3.0:1 on its canvas', () => {
    for (const name of ALL_SCHEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const ratio = contrastRatio(schemes[name].accent[mode].primary, canvasFor(name, mode))
        expect(ratio).toBeGreaterThanOrEqual(3.0)
      }
    }
  })

  it('floor 3: primary-soft as accent text clears 4.5:1 on its canvas', () => {
    for (const name of ALL_SCHEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const ratio = contrastRatio(schemes[name].primarySoft[mode], canvasFor(name, mode))
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
