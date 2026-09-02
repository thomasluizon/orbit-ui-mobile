import { afterEach, describe, expect, it } from 'vitest'
import {
  createSurfaces,
  createTokensV2,
  getRuntimeTheme,
  setRuntimeTheme,
  tintFromPrimary,
  tokens,
} from '@/lib/theme'

type Rgb = readonly [number, number, number]

function parseColor(color: string): { channels: Rgb; alpha: number } {
  if (color.startsWith('#')) {
    return {
      channels: [1, 3, 5].map((offset) =>
        Number.parseInt(color.slice(offset, offset + 2), 16),
      ) as unknown as Rgb,
      alpha: 1,
    }
  }
  const channels = color.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${color}`)
  return {
    channels: channels.slice(0, 3) as unknown as Rgb,
    alpha: channels[3] ?? 1,
  }
}

function composite(color: string, background: Rgb): Rgb {
  const { channels, alpha } = parseColor(color)
  return channels.map((channel, index) =>
    Math.round(channel * alpha + background[index]! * (1 - alpha)),
  ) as unknown as Rgb
}

function contrast(foreground: string, background: Rgb): number {
  const linear = (channel: number) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = (channels: Rgb) =>
    0.2126 * linear(channels[0]) +
    0.7152 * linear(channels[1]) +
    0.0722 * linear(channels[2])
  const foregroundLuminance = luminance(parseColor(foreground).channels)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe('mobile theme runtime', () => {
  afterEach(() => {
    setRuntimeTheme({ scheme: 'purple', themeMode: 'dark' })
  })

  it('dark resolves the granted accent byte-exact', () => {
    const dark = createTokensV2('purple', 'dark')

    expect(dark.bg).toBe('#09090B')
    expect(dark.bgCard).toBe('rgba(250,250,250,0.04)')
    expect(dark.bgField).toBe('rgba(250,250,250,0.06)')
    expect(dark.bgWell).toBe('rgba(250,250,250,0.08)')
    expect(dark.bgElev).toBe('#1C1C1E')
    expect(dark.bgElev2).toBe('rgba(250,250,250,0.12)')
    expect(dark.bgHover).toBe('rgba(250,250,250,0.14)')
    expect(dark.bgSunk).toBe('rgba(0,0,0,0.28)')
    expect(dark.hairline).toBe('rgba(255,255,255,0.08)')
    expect(dark.borderControl).toBe('rgba(255,255,255,0.08)')
    expect(dark.hairlineGhost).toBe('rgba(255,255,255,0.10)')
    expect(dark.hairlineStrong).toBe('rgba(255,255,255,0.16)')
    expect(dark.scrim).toBe('rgba(0,0,0,0.55)')
    expect(dark.fg1).toBe('#F4F4F6')
    expect(dark.fg2).toBe('#C9C9CC')
    expect(dark.fg3).toBe('#8F8F93')
    expect(dark.fg4).toBe('#5D5D60')
    expect(dark.primary).toBe('#C4530F')
    expect(dark.primaryHover).toBe('#B74E12')
    expect(dark.primaryPressed).toBe('#A24716')
    expect(dark.primarySoft).toBe('#C85716')
    expect(dark.primaryDim).toBe('#261611')
    expect(dark.primaryRgb).toBe('196,83,15')
    expect(dark.fgOnPrimary).toBe('#FFFFFF')
    expect(dark.statusDone).toBe('#F4F4F6')
    expect(dark.statusEmpty).toBe('#5D5D60')
    expect(dark.statusFrozen).toBe('#C9C9CC')
    expect(dark.statusOverdue).toBe('#FE9A00')
    expect(dark.statusBad).toBe('#FB2C36')
    expect(dark.fgOnBad).toBe('#020618')
    expect(dark.fgOnOverdue).toBe('#020618')
    expect(dark.selectionBg).toBe('rgba(196,83,15,0.32)')
  })

  it('resolves every served scheme to the granted accent', () => {
    for (const scheme of ['purple', 'blue', 'green', 'rose', 'orange', 'cyan'] as const) {
      expect(createTokensV2(scheme, 'dark').primary).toBe('#C4530F')
      expect(createTokensV2(scheme, 'light').primary).toBe('#C4530F')
      expect(createTokensV2(scheme, 'dark').fgOnPrimary).toBe('#FFFFFF')
      expect(createTokensV2(scheme, 'light').fgOnPrimary).toBe('#FFFFFF')
    }
  })

  it('exposes AA status text variants alongside the base status colors', () => {
    const dark = createTokensV2('purple', 'dark')
    const light = createTokensV2('purple', 'light')

    expect(dark.statusOverdueText).toBe(dark.statusOverdue)
    expect(dark.statusBadText).toBe(dark.statusBad)
    expect(light.statusBadText).toBe(light.statusBad)
    expect(light.statusOverdue).toBe('#946A00')
    expect(light.statusOverdueText).toBe('#946A00')
    expect(dark.fgOnBad).toBe('#020618')
    expect(light.fgOnBad).toBe('#FFFFFF')
  })

  it('light uses the pale canvas and its granted accent variants', () => {
    const light = createTokensV2('purple', 'light')

    expect(light.bg).toBe('#FAFAFA')
    expect(light.bgCard).toBe('#FFFFFF')
    expect(light.bgField).toBe('#FFFFFF')
    expect(light.bgWell).toBe('rgba(9,9,11,0.04)')
    expect(light.bgElev).toBe('#FFFFFF')
    expect(light.bgElev2).toBe('#FFFFFF')
    expect(light.bgHover).toBe('rgba(9,9,11,0.06)')
    expect(light.bgSunk).toBe('rgba(9,9,11,0.04)')
    expect(light.hairline).toBe('rgba(9,9,11,0.08)')
    expect(light.borderControl).toBe('rgba(9,9,11,0.08)')
    expect(light.hairlineGhost).toBe('rgba(9,9,11,0.10)')
    expect(light.hairlineStrong).toBe('rgba(9,9,11,0.16)')
    expect(light.scrim).toBe('rgba(0,0,0,0.55)')
    expect(light.fg1).toBe('#1A1A1D')
    expect(light.fg2).toBe('#424247')
    expect(light.fg3).toBe('#68686D')
    expect(light.fg4).toBe('#89898D')
    expect(light.primary).toBe('#C4530F')
    expect(light.primaryHover).toBe('#B74E12')
    expect(light.primaryPressed).toBe('#A24716')
    expect(light.primarySoft).toBe('#C15109')
    expect(light.primaryDim).toBe('#F4DDD3')
    expect(light.primaryRgb).toBe('196,83,15')
    expect(light.fgOnPrimary).toBe('#FFFFFF')
    expect(light.statusDone).toBe('#1A1A1D')
    expect(light.statusEmpty).toBe('#89898D')
    expect(light.statusFrozen).toBe('#424247')
    expect(light.statusOverdue).toBe('#946A00')
    expect(light.statusBad).toBe('#E7000B')
    expect(light.fgOnBad).toBe('#FFFFFF')
    expect(light.fgOnOverdue).toBe('#FFFFFF')
    expect(light.selectionBg).toBe('rgba(196,83,15,0.18)')
    expect(light.bg).not.toBe(createTokensV2('purple', 'dark').bg)
  })

  it('updates the exported tokens proxy when runtime theme changes', () => {
    setRuntimeTheme({ scheme: 'blue', themeMode: 'light' })

    expect(getRuntimeTheme()).toEqual({ scheme: 'blue', themeMode: 'light' })
    expect(tokens.bg).toBe(createTokensV2('blue', 'light').bg)
    expect(tokens.primary).toBe(createTokensV2('blue', 'light').primary)
  })

  it('derives primary tints from the granted accent channels', () => {
    const green = createTokensV2('green', 'dark')

    expect(tintFromPrimary(green, 0.18)).toBe('rgba(196,83,15,0.18)')
  })

  it('uses the opaque overlay role for dark sheets', () => {
    const dark = createTokensV2('purple', 'dark')
    const darkSurfaces = createSurfaces('purple', 'dark')

    expect(darkSurfaces.sheet.backgroundColor).toBe(dark.bgElev)
    expect(darkSurfaces.elevated.backgroundColor).toBe(dark.bgElev)
  })

  it('uses opaque white sheet and card surfaces on light', () => {
    const lightSurfaces = createSurfaces('purple', 'light')

    expect(lightSurfaces.sheet.backgroundColor).toBe('#FFFFFF')
    expect(lightSurfaces.elevated.backgroundColor).toBe('#FFFFFF')
  })

  it('keeps neutral text AA on every raised and tinted component surface', () => {
    for (const scheme of ['purple', 'blue', 'green', 'rose', 'orange', 'cyan'] as const) {
      for (const mode of ['dark', 'light'] as const) {
        const resolved = createTokensV2(scheme, mode)
        const canvas = parseColor(resolved.bg).channels
        const card = composite(resolved.bgCard, canvas)
        const elevated = composite(resolved.bgElev, canvas)
        const sheet = parseColor(resolved.bgSheet).channels
        const tint = composite(tintFromPrimary(resolved, 0.12), card)

        for (const [foreground, background] of [
          [resolved.fg1, card],
          [resolved.fg1, elevated],
          [resolved.fg2, sheet],
          [resolved.fg1, tint],
        ] as const) {
          expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
