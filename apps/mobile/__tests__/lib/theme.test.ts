import { afterEach, describe, expect, it } from 'vitest'
import {
  blendElevOverCanvas,
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

    expect(dark.bg).toBe('#020618')
    expect(dark.fg1).toBe('#f8fafc')
    expect(dark.fg2).toBe('#cad5e2')
    expect(dark.fg3).toBe('#90a1b9')
    expect(dark.fg4).toBe('#62748e')
    expect(dark.bgElev).toBe('rgba(248, 250, 252, 0.06)')
    expect(dark.primary).toBe('#C4530F')
    expect(dark.primaryHover).toBe('#b74e12')
    expect(dark.primaryPressed).toBe('#a24716')
    expect(dark.primarySoft).toBe('#c85716')
    expect(dark.primaryDim).toBe('#261611')
    expect(dark.fgOnPrimary).toBe('#ffffff')
  })

  it('resolves every served scheme to the granted accent', () => {
    for (const scheme of ['purple', 'blue', 'green', 'rose', 'orange', 'cyan'] as const) {
      expect(createTokensV2(scheme, 'dark').primary).toBe('#C4530F')
      expect(createTokensV2(scheme, 'light').primary).toBe('#C4530F')
      expect(createTokensV2(scheme, 'dark').fgOnPrimary).toBe('#ffffff')
      expect(createTokensV2(scheme, 'light').fgOnPrimary).toBe('#ffffff')
    }
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

  it('light uses the pale canvas and its granted accent variants', () => {
    const light = createTokensV2('purple', 'light')

    expect(light.bg).toBe('#f8fafc')
    expect(light.bgElev).toBe('rgb(255, 255, 255)')
    expect(light.fg1).toBe('#0f172b')
    expect(light.primary).toBe('#C4530F')
    expect(light.primaryHover).toBe('#b74e12')
    expect(light.primaryPressed).toBe('#a24716')
    expect(light.primarySoft).toBe('#c15109')
    expect(light.primaryDim).toBe('#f4ddd3')
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

    expect(tintFromPrimary(green, 0.18)).toBe('rgba(196, 83, 15, 0.18)')
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
