import type { ColorScheme, SchemeMode } from './types'
import { schemes } from './color-schemes'

function srgbCompand(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
}

function oklchToRgbChannels(
  lightness: number,
  chroma: number,
  hueDegrees: number,
): [number, number, number] {
  const hueRad = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hueRad)
  const b = chroma * Math.sin(hueRad)

  const lLin = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mLin = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sLin = lightness - 0.0894841775 * a - 1.2914855480 * b

  const l = lLin * lLin * lLin
  const m = mLin * mLin * mLin
  const s = sLin * sLin * sLin

  const clamp = (channel: number) =>
    Math.round(Math.max(0, Math.min(1, srgbCompand(channel))) * 255)

  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}

/** Converts an OKLCH color to an sRGB hex string (the platform-shared pipeline). */
export function oklchToHex(
  lightness: number,
  chroma: number,
  hueDegrees: number,
): string {
  const [r, g, b] = oklchToRgbChannels(lightness, chroma, hueDegrees)
  const toHexByte = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

/** Converts an OKLCH color to an rgba() string with the given alpha. */
export function oklchToRgba(
  lightness: number,
  chroma: number,
  hueDegrees: number,
  alpha: number,
): string {
  const [r, g, b] = oklchToRgbChannels(lightness, chroma, hueDegrees)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface NeutralTokenSpec {
  readonly lightness: number
  readonly chroma: number
  readonly hueOffset: number
  readonly group: 'bg' | 'fg'
}

export interface NeutralRamp {
  readonly dark: {
    readonly bg: NeutralTokenSpec
    readonly fg1: NeutralTokenSpec
    readonly fg2: NeutralTokenSpec
    readonly fg3: NeutralTokenSpec
    readonly fg4: NeutralTokenSpec
  }
  readonly light: {
    readonly bg: NeutralTokenSpec
    readonly bgSunk: NeutralTokenSpec
    readonly fg1: NeutralTokenSpec
    readonly fg2: NeutralTokenSpec
    readonly fg3: NeutralTokenSpec
    readonly fg4: NeutralTokenSpec
  }
}

/**
 * Locked OKLCH ramp shape shared by all schemes. Lightness and chroma are
 * fixed per token; each token carries the handoff ramp's hue drift as an
 * offset from the scheme's canvas hue. Purple resolves byte-exact to the
 * handoff slate palette (see DESIGN.md derivation rules).
 */
export const neutralRamp: NeutralRamp = {
  dark: {
    bg: { lightness: 0.1298, chroma: 0.0425, hueOffset: 0, group: 'bg' },
    fg1: { lightness: 0.9842, chroma: 0.0034, hueOffset: -17.2746, group: 'fg' },
    fg2: { lightness: 0.8686, chroma: 0.0216, hueOffset: -12.6185, group: 'fg' },
    fg3: { lightness: 0.7038, chroma: 0.0402, hueOffset: -8.1393, group: 'fg' },
    fg4: { lightness: 0.5542, chroma: 0.046, hueOffset: -7.6061, group: 'fg' },
  },
  light: {
    bg: { lightness: 0.9842, chroma: 0.0034, hueOffset: -17.2746, group: 'bg' },
    bgSunk: { lightness: 0.9683, chroma: 0.0069, hueOffset: -17.2366, group: 'bg' },
    fg1: { lightness: 0.2084, chroma: 0.0417, hueOffset: 1.227, group: 'fg' },
    fg2: { lightness: 0.3717, chroma: 0.0449, hueOffset: -7.7086, group: 'fg' },
    fg3: { lightness: 0.5542, chroma: 0.046, hueOffset: -7.6061, group: 'fg' },
    fg4: { lightness: 0.7038, chroma: 0.0402, hueOffset: -8.1393, group: 'fg' },
  },
}

/** Resolves one neutral token to hex for the given scheme. */
export function resolveNeutralToken(
  scheme: ColorScheme,
  spec: NeutralTokenSpec,
): string {
  const def = schemes[scheme]
  const scale = spec.group === 'bg' ? def.chromaScaleBg : def.chromaScaleFg
  const hue = (def.neutralHue + spec.hueOffset + 360) % 360
  return oklchToHex(spec.lightness, spec.chroma * scale, hue)
}

export interface DarkNeutrals {
  bg: string
  fg1: string
  fg2: string
  fg3: string
  fg4: string
}

export interface LightNeutrals extends DarkNeutrals {
  bgSunk: string
}

export function resolveDarkNeutrals(scheme: ColorScheme): DarkNeutrals {
  const ramp = neutralRamp.dark
  return {
    bg: resolveNeutralToken(scheme, ramp.bg),
    fg1: resolveNeutralToken(scheme, ramp.fg1),
    fg2: resolveNeutralToken(scheme, ramp.fg2),
    fg3: resolveNeutralToken(scheme, ramp.fg3),
    fg4: resolveNeutralToken(scheme, ramp.fg4),
  }
}

export function resolveLightNeutrals(scheme: ColorScheme): LightNeutrals {
  const ramp = neutralRamp.light
  return {
    bg: resolveNeutralToken(scheme, ramp.bg),
    bgSunk: resolveNeutralToken(scheme, ramp.bgSunk),
    fg1: resolveNeutralToken(scheme, ramp.fg1),
    fg2: resolveNeutralToken(scheme, ramp.fg2),
    fg3: resolveNeutralToken(scheme, ramp.fg3),
    fg4: resolveNeutralToken(scheme, ramp.fg4),
  }
}

export interface AlphaSurfaceConstants {
  readonly bgElev: string
  readonly bgElev2: string
  readonly bgSunk?: string
  readonly hairline: string
  readonly hairlineStrong: string
  readonly statusEmpty: string
}

/**
 * Scheme-independent alpha surfaces: white-alpha over the dark canvas,
 * ink-alpha over the light canvas. They inherit tint optically from the
 * canvas beneath and are identical across all 6 schemes (handoff mechanism).
 */
export const alphaSurfaces: Record<SchemeMode, AlphaSurfaceConstants> = {
  dark: {
    bgElev: 'rgba(248, 250, 252, 0.06)',
    bgElev2: 'rgba(248, 250, 252, 0.10)',
    bgSunk: 'rgba(0, 0, 0, 0.28)',
    hairline: 'rgba(248, 250, 252, 0.10)',
    hairlineStrong: 'rgba(248, 250, 252, 0.18)',
    statusEmpty: 'rgba(248, 250, 252, 0.22)',
  },
  light: {
    bgElev: 'rgb(255, 255, 255)',
    bgElev2: 'rgb(255, 255, 255)',
    hairline: 'rgba(2, 6, 24, 0.08)',
    hairlineStrong: 'rgba(2, 6, 24, 0.16)',
    statusEmpty: 'rgba(2, 6, 24, 0.18)',
  },
}

export interface StatusConstants {
  readonly overdue: string
  readonly bad: string
  readonly frozen: string
}

/** Fixed (not scheme-tinted) chromatic status colors per mode. */
export const statusConstants: Record<SchemeMode, StatusConstants> = {
  dark: { overdue: '#fe9a00', bad: '#fb2c36', frozen: '#00d3f3' },
  light: { overdue: '#e17100', bad: '#e7000b', frozen: '#0092b8' },
}

/** Alpha applied to the scheme's primaryRgb for text selection. */
export const selectionAlpha: Record<SchemeMode, number> = {
  dark: 0.32,
  light: 0.18,
}

export const primaryTintAlphas = {
  bg: 0.08,
  bgHover: 0.1,
  selected: 0.12,
  iconWell: 0.15,
  soft: 0.18,
  ring: 0.28,
  glow: 0.45,
} as const
