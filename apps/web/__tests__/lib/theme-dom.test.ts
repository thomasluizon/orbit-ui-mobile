import { afterEach, describe, expect, it } from 'vitest'
import {
  alphaSurfaces,
  resolveDarkNeutrals,
  resolveLightNeutrals,
  type ColorScheme,
  type ThemeMode,
} from '@orbit/shared'
import {
  applyThemeTokensToDOM,
  resolveWebThemeVariables,
} from '@/lib/theme-dom'

const SCHEMES: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']
const MODES: ThemeMode[] = ['dark', 'light']

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

describe('web theme variables', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  for (const scheme of SCHEMES) {
    for (const mode of MODES) {
      it(`${scheme} ${mode} resolves the granted accent`, () => {
        const variables = resolveWebThemeVariables(scheme, mode)

        expect(variables['--primary']).toBe('#C4530F')
        expect(variables['--primary-hover']).toBe('#b74e12')
        expect(variables['--primary-pressed']).toBe('#a24716')
        expect(variables['--primary-rgb']).toBe('196, 83, 15')
        expect(variables['--fg-on-primary']).toBe('#ffffff')
        expect(variables['--primary-soft']).toBe(
          mode === 'dark' ? '#c85716' : '#c15109',
        )
        expect(variables['--primary-dim']).toBe(
          mode === 'dark' ? '#261611' : '#f4ddd3',
        )
      })
    }
  }

  it('honors the served scheme while applying shared values to the document', () => {
    applyThemeTokensToDOM('rose', 'light')

    const root = document.documentElement
    expect(root.classList.contains('scheme-rose')).toBe(true)
    expect(root.classList.contains('light')).toBe(true)
    expect(root.style.getPropertyValue('--primary')).toBe('#C4530F')
    expect(root.style.getPropertyValue('--primary-soft')).toBe('#c15109')
  })

  it('keeps neutral text AA on every raised and tinted component surface', () => {
    for (const scheme of SCHEMES) {
      for (const mode of MODES) {
        const neutrals = mode === 'dark'
          ? resolveDarkNeutrals(scheme)
          : resolveLightNeutrals(scheme)
        const canvas = parseColor(neutrals.bg).channels
        const card = composite(alphaSurfaces[mode].bgCard, canvas)
        const elevated = composite(alphaSurfaces[mode].bgElev, canvas)
        const sheet = mode === 'dark'
          ? composite('rgba(248, 250, 252, 0.05)', canvas)
          : parseColor('#ffffff').channels
        const primary = resolveWebThemeVariables(scheme, mode)['--primary']!
        const tint = composite(
          `rgba(${parseColor(primary).channels.join(', ')}, 0.12)`,
          card,
        )

        for (const [foreground, background] of [
          [neutrals.fg1, card],
          [neutrals.fg1, elevated],
          [neutrals.fg2, sheet],
          [neutrals.fg1, tint],
        ] as const) {
          expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
