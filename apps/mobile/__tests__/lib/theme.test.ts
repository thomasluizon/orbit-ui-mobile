import { afterEach, describe, expect, it } from 'vitest'
import {
  blendElevOverCanvas,
  createSurfaces,
  createTokensV2,
  getRuntimeTheme,
  primaryGlow,
  setRuntimeTheme,
  tintFromPrimary,
  tokens,
} from '@/lib/theme'

describe('mobile theme runtime', () => {
  afterEach(() => {
    setRuntimeTheme({ scheme: 'purple', themeMode: 'dark' })
  })

  it('purple dark resolves the handoff palette byte-exact', () => {
    const dark = createTokensV2('purple', 'dark')

    expect(dark.bg).toBe('#020618')
    expect(dark.fg1).toBe('#f8fafc')
    expect(dark.fg2).toBe('#cad5e2')
    expect(dark.fg3).toBe('#90a1b9')
    expect(dark.fg4).toBe('#62748e')
    expect(dark.bgElev).toBe('rgba(248, 250, 252, 0.06)')
    expect(dark.primary).toBe('#7f46f7')
    expect(dark.gradientHeaderFrom).toBe('#22094f')
    expect(dark.gradientHeaderTo).toBe('rgba(2, 6, 24, 0)')
  })

  it('purple light uses the pale handoff canvas with opaque white cards', () => {
    const light = createTokensV2('purple', 'light')

    expect(light.bg).toBe('#f8fafc')
    expect(light.bgElev).toBe('rgb(255, 255, 255)')
    expect(light.fg1).toBe('#0f172b')
    expect(light.primary).toBe('#631df2')
    expect(light.bg).not.toBe(createTokensV2('purple', 'dark').bg)
  })

  it('updates the exported tokens proxy when runtime theme changes', () => {
    setRuntimeTheme({ scheme: 'blue', themeMode: 'light' })

    expect(getRuntimeTheme()).toEqual({ scheme: 'blue', themeMode: 'light' })
    expect(tokens.bg).toBe(createTokensV2('blue', 'light').bg)
    expect(tokens.primary).toBe(createTokensV2('blue', 'light').primary)
  })

  it('derives primary tints and glow from primaryRgb, never hardcoded violet', () => {
    const green = createTokensV2('green', 'dark')

    expect(tintFromPrimary(green, 0.18)).toBe('rgba(0, 201, 80, 0.18)')
    expect(primaryGlow(green).shadowColor).toBe('#00c950')
    expect(primaryGlow(green).shadowOpacity).toBe(0.45)
  })

  it('pre-blends sheet surfaces to solid hexes on dark', () => {
    const dark = createTokensV2('purple', 'dark')
    const darkSurfaces = createSurfaces('purple', 'dark')

    expect(darkSurfaces.sheet.backgroundColor).toBe(blendElevOverCanvas(dark, 0.05))
    expect(darkSurfaces.sheet.backgroundColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(darkSurfaces.elevated.backgroundColor).toBe(dark.bgElev)
  })

  it('uses opaque white sheet and card surfaces on light', () => {
    const lightSurfaces = createSurfaces('purple', 'light')

    expect(lightSurfaces.sheet.backgroundColor).toBe('#ffffff')
    expect(lightSurfaces.elevated.backgroundColor).toBe('rgb(255, 255, 255)')
  })
})
