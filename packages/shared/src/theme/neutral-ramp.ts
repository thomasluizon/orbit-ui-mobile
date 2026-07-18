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
 * fixed per token; each token carries the ramp's hue drift as an offset from
 * the scheme's canvas hue. Purple resolves byte-exact to the frozen (#539 b5)
 * neutral palette: dark canvas #070910, fg-1..4 #f6f7f9/#c7cbd2/#888e99/#565c67
 * (see DESIGN.md derivation rules).
 */
export const neutralRamp: NeutralRamp = {
  dark: {
    bg: { lightness: 0.14104069155540352, chroma: 0.015939302762573243, hueOffset: 0, group: 'bg' },
    fg1: { lightness: 0.975941527186872, chroma: 0.0028673413166476263, hueOffset: -5.807762834095854, group: 'fg' },
    fg2: { lightness: 0.8410737668002215, chroma: 0.010665714854488782, hueOffset: -8.563258024857873, group: 'fg' },
    fg3: { lightness: 0.6453693702335441, chroma: 0.017824864895508642, hueOffset: -7.628241447918015, group: 'fg' },
    fg4: { lightness: 0.47346558472924744, chroma: 0.019304208173662258, hueOffset: -7.675995172411376, group: 'fg' },
  },
  light: {
    bg: { lightness: 0.9841518630825351, chroma: 0.003412665198490683, hueOffset: -22.492258453348995, group: 'bg' },
    bgSunk: { lightness: 0.9682603461349981, chroma: 0.006853583273311416, hueOffset: -22.45423513044682, group: 'bg' },
    fg1: { lightness: 0.208402856504579, chroma: 0.04166282575754041, hueOffset: -3.990596293373983, group: 'fg' },
    fg2: { lightness: 0.3717277546786527, chroma: 0.044925940120119565, hueOffset: -12.926197336406062, group: 'fg' },
    fg3: { lightness: 0.5541629781808084, chroma: 0.04598794851178141, hueOffset: -12.823749241986093, group: 'fg' },
    fg4: { lightness: 0.7038202552146957, chroma: 0.04016718204045253, hueOffset: -13.356914246819201, group: 'fg' },
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
  readonly bgCard: string
  readonly bgField?: string
  readonly bgElev: string
  readonly bgElev2: string
  readonly bgSunk?: string
  readonly hairline: string
  readonly hairlineGhost: string
  readonly hairlineStrong: string
  readonly statusEmpty: string
}

/**
 * Scheme-independent alpha surfaces: white-alpha over the dark canvas,
 * ink-alpha over the light canvas. They inherit tint optically from the
 * canvas beneath and are identical across all 6 schemes (handoff mechanism).
 * Dark translucency ladder: 0.04 card / 0.05 field / 0.06 well / 0.10 elev-2.
 * Light cards are opaque white; light fields use the scheme-tinted bgSunk
 * (resolved in the token factories, not a constant here).
 */
export const alphaSurfaces: Record<SchemeMode, AlphaSurfaceConstants> = {
  dark: {
    bgCard: 'rgba(248, 250, 252, 0.04)',
    bgField: 'rgba(248, 250, 252, 0.05)',
    bgElev: 'rgba(248, 250, 252, 0.06)',
    bgElev2: 'rgba(248, 250, 252, 0.10)',
    bgSunk: 'rgba(0, 0, 0, 0.28)',
    hairline: 'rgba(248, 250, 252, 0.10)',
    hairlineGhost: 'rgba(255, 255, 255, 0.10)',
    hairlineStrong: 'rgba(248, 250, 252, 0.18)',
    statusEmpty: 'rgba(248, 250, 252, 0.22)',
  },
  light: {
    bgCard: 'rgb(255, 255, 255)',
    bgElev: 'rgb(255, 255, 255)',
    bgElev2: 'rgb(255, 255, 255)',
    hairline: 'rgba(2, 6, 24, 0.08)',
    hairlineGhost: 'rgba(2, 6, 24, 0.10)',
    hairlineStrong: 'rgba(2, 6, 24, 0.16)',
    statusEmpty: 'rgba(2, 6, 24, 0.18)',
  },
}

export interface StatusConstants {
  readonly overdue: string
  readonly bad: string
  readonly frozen: string
  readonly overdueText: string
  readonly badText: string
  readonly fgOnBad: string
}

/**
 * Fixed (not scheme-tinted) chromatic status colors per mode. Dots, rings and
 * icons use the base values; status-colored TEXT uses the `-Text` variants,
 * guaranteed >= 4.5:1 WCAG AA on the mode canvas (only light overdue needed
 * darkening; the other three equal their base). `fgOnBad` is the foreground for
 * text/icons painted ON a `bad` fill (e.g. destructive confirm pill): ink in
 * dark (white-on-bad is only 3.81:1), white in light (ink-on-bad is only 4.23:1).
 */
export const statusConstants: Record<SchemeMode, StatusConstants> = {
  dark: {
    overdue: '#fe9a00',
    bad: '#fb2c36',
    frozen: '#00d3f3',
    overdueText: '#fe9a00',
    badText: '#fb2c36',
    fgOnBad: '#020618',
  },
  light: {
    overdue: '#e17100',
    bad: '#e7000b',
    frozen: '#0092b8',
    overdueText: '#b45b00',
    badText: '#e7000b',
    fgOnBad: '#ffffff',
  },
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
} as const
