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

    expect(dark.bg).toBe('#070910')
    expect(dark.fg1).toBe('#f6f7f9')
    expect(dark.fg2).toBe('#c7cbd2')
    expect(dark.fg3).toBe('#888e99')
    expect(dark.fg4).toBe('#565c67')
    expect(dark.bgElev).toBe('rgba(248, 250, 252, 0.06)')
    expect(dark.primary).toBe('#8659ea')
    expect(dark.primarySoft).toBe('#b69bf8')
    expect(dark.fgOnPrimary).toBe('#ffffff')
  })

  it('resolves fg-on-primary per scheme and mode (AA flips to canvas ink)', () => {
    expect(createTokensV2('purple', 'light').fgOnPrimary).toBe('#ffffff')
    expect(createTokensV2('blue', 'light').fgOnPrimary).toBe('#ffffff')
    expect(createTokensV2('rose', 'light').fgOnPrimary).toBe('#ffffff')
    expect(createTokensV2('blue', 'dark').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('rose', 'dark').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('green', 'dark').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('green', 'light').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('orange', 'dark').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('orange', 'light').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('cyan', 'dark').fgOnPrimary).toBe('#020618')
    expect(createTokensV2('cyan', 'light').fgOnPrimary).toBe('#020618')
  })

  it('exposes AA status text variants alongside the base status colors', () => {
    const dark = createTokensV2('purple', 'dark')
    const light = createTokensV2('purple', 'light')

    expect(dark.statusOverdueText).toBe(dark.statusOverdue)
    expect(dark.statusBadText).toBe(dark.statusBad)
    expect(light.statusBadText).toBe(light.statusBad)
    expect(light.statusOverdue).toBe('#e17100')
    expect(light.statusOverdueText).toBe('#b45b00')
    expect(dark.fgOnBad).toBe('#020618')
    expect(light.fgOnBad).toBe('#ffffff')
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
