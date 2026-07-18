import {
  alphaSurfaces,
  motionEasings,
  resolveDarkNeutrals,
  resolveLightNeutrals,
  schemes,
  selectionAlpha,
  statusConstants,
  type ColorScheme,
} from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'

export { zLayers, type ZLayer } from '@orbit/shared/theme'

type ThemeRuntime = {
  scheme: ColorScheme
  themeMode: ThemeMode
}

export interface AppRadius {
  sm: number
  md: number
  lg: number
  xl: number
  '2xl': number
  sheet: number
  full: number
}

export interface ShadowValue extends Record<string, unknown> {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
}

export interface AppShadows {
  sm: ShadowValue
  md: ShadowValue
  lg: ShadowValue
  cardParent: ShadowValue
  cardParentHover: ShadowValue
  cardChild: ShadowValue
}

export interface AppSurfaceLayer {
  backgroundColor: string
  borderColor: string
  shadow: ShadowValue
  elevation: number
}

export interface AppSurfaces {
  screen: {
    backgroundColor: string
  }
  elevated: AppSurfaceLayer
  overlay: AppSurfaceLayer
  sheet: AppSurfaceLayer
}

let runtimeTheme: ThemeRuntime = {
  scheme: 'purple',
  themeMode: 'dark',
}

export function setRuntimeTheme(next: Partial<ThemeRuntime>) {
  runtimeTheme = {
    ...runtimeTheme,
    ...next,
  }
}

export function getRuntimeTheme() {
  return runtimeTheme
}

export const radius: AppRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 20,
  sheet: 26,
  full: 9999,
} as const

/** Raw bezier control points for use with Easing.bezier(...) */
export const easings = {
  spring: motionEasings.emphasize,
  out: motionEasings.enter,
  smooth: motionEasings.standard,
}

export interface AppTokensV2 {
  bg: string
  /** Card fill — dark translucency ladder step 0.04; opaque white on light. */
  bgCard: string
  /** Field fill (dark ladder step 0.05; scheme-tinted sunk on light). */
  bgField: string
  /** Emoji-well fill (dark ladder step 0.06; scheme-tinted sunk on light). */
  bgWell: string
  bgElev: string
  bgElev2: string
  /** Press/active lift from `bgElev` (elev-2 alpha on dark, sunk on light). */
  bgElevPressed: string
  /** Solid sheet/dialog panel — elev alpha pre-blended over the canvas. */
  bgSheet: string
  bgSunk: string
  hairline: string
  hairlineGhost: string
  hairlineStrong: string
  fg1: string
  fg2: string
  fg3: string
  fg4: string
  fgOnPrimary: string
  primary: string
  primaryPressed: string
  /** "r, g, b" channels of `primary` for alpha tints (never hardcode violet). */
  primaryRgb: string
  /** Accent-text token: the per-scheme `primarySoft` clearing the text floor on canvas. */
  primarySoft: string
  statusDone: string
  statusEmpty: string
  statusSkip: string
  statusOverdue: string
  statusBad: string
  statusFrozen: string
  /** AA text variant of `statusOverdue` — use for status-colored text. */
  statusOverdueText: string
  /** AA text variant of `statusBad` — use for status-colored text. */
  statusBadText: string
  /** Foreground for text/icons painted on a `statusBad` fill (ink dark, white light). */
  fgOnBad: string
  /** Foreground for text/icons painted on a `statusOverdue` (amber) fill: fixed canvas ink both modes (white fails AA on amber). */
  fgOnOverdue: string
  selectionBg: string
  /** Canonical modal/sheet backdrop scrim, theme-independent (DESIGN.md Sheet: rgba(0,0,0,0.55)). Mirrors the web overlay's `bg-black/55`. */
  scrim: string
}

export interface AppShadowV2 extends Record<string, unknown> {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
  elevation: number
}

export interface AppShadowsV2 {
  shadow1: AppShadowV2
  shadow2: AppShadowV2
  shadow3: AppShadowV2
}

function hexChannels(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function blendWhiteOverHex(baseHex: string, alpha: number): string {
  const [r, g, b] = hexChannels(baseHex)
  const blend = (canvas: number, white: number) =>
    Math.round(canvas * (1 - alpha) + white * alpha)
  const toHexByte = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${toHexByte(blend(r, 248))}${toHexByte(blend(g, 250))}${toHexByte(blend(b, 252))}`
}

export function createTokensV2(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppTokensV2 {
  const accent = schemes[colorScheme].accent[themeMode]
  const fgOnPrimary = schemes[colorScheme].fgOnPrimary[themeMode]
  const alpha = alphaSurfaces[themeMode]
  const status = statusConstants[themeMode]

  if (themeMode === 'light') {
    const neutrals = resolveLightNeutrals(colorScheme)
    return {
      bg: neutrals.bg,
      bgCard: alpha.bgCard,
      bgField: neutrals.bgSunk,
      bgWell: neutrals.bgSunk,
      bgElev: alpha.bgElev,
      bgElev2: alpha.bgElev2,
      bgElevPressed: neutrals.bgSunk,
      bgSheet: '#ffffff',
      bgSunk: neutrals.bgSunk,
      hairline: alpha.hairline,
      hairlineGhost: alpha.hairlineGhost,
      hairlineStrong: alpha.hairlineStrong,
      fg1: neutrals.fg1,
      fg2: neutrals.fg2,
      fg3: neutrals.fg3,
      fg4: neutrals.fg4,
      fgOnPrimary,
      primary: accent.primary,
      primaryPressed: accent.primaryPressed,
      primaryRgb: accent.primaryRgb,
      primarySoft: schemes[colorScheme].primarySoft[themeMode],
      statusDone: accent.primary,
      statusEmpty: alpha.statusEmpty,
      statusSkip: neutrals.fg3,
      statusOverdue: status.overdue,
      statusBad: status.bad,
      statusFrozen: status.frozen,
      statusOverdueText: status.overdueText,
      statusBadText: status.badText,
      fgOnBad: status.fgOnBad,
      fgOnOverdue: '#020618',
      selectionBg: `rgba(${accent.primaryRgb}, ${selectionAlpha.light})`,
      scrim: 'rgba(0, 0, 0, 0.55)',
    }
  }

  const neutrals = resolveDarkNeutrals(colorScheme)
  return {
    bg: neutrals.bg,
    bgCard: alpha.bgCard,
    bgField: alpha.bgField ?? 'rgba(248, 250, 252, 0.05)',
    bgWell: alpha.bgElev,
    bgElev: alpha.bgElev,
    bgElev2: alpha.bgElev2,
    bgElevPressed: alpha.bgElev2,
    bgSheet: blendWhiteOverHex(neutrals.bg, 0.05),
    bgSunk: alpha.bgSunk ?? 'rgba(0, 0, 0, 0.28)',
    hairline: alpha.hairline,
    hairlineGhost: alpha.hairlineGhost,
    hairlineStrong: alpha.hairlineStrong,
    fg1: neutrals.fg1,
    fg2: neutrals.fg2,
    fg3: neutrals.fg3,
    fg4: neutrals.fg4,
    fgOnPrimary,
    primary: accent.primary,
    primaryPressed: accent.primaryPressed,
    primaryRgb: accent.primaryRgb,
    primarySoft: schemes[colorScheme].primarySoft[themeMode],
    statusDone: accent.primary,
    statusEmpty: alpha.statusEmpty,
    statusSkip: neutrals.fg3,
    statusOverdue: status.overdue,
    statusBad: status.bad,
    statusFrozen: status.frozen,
    statusOverdueText: status.overdueText,
    statusBadText: status.badText,
    fgOnBad: status.fgOnBad,
    fgOnOverdue: '#020618',
    selectionBg: `rgba(${accent.primaryRgb}, ${selectionAlpha.dark})`,
    scrim: 'rgba(0, 0, 0, 0.55)',
  }
}

export const tokens = new Proxy({} as AppTokensV2, {
  get: (_target, prop) => createTokensV2()[prop as keyof AppTokensV2],
})

/** rgba() tint of the scheme primary at the given alpha (handoff tint ladder). */
export function tintFromPrimary(appTokens: AppTokensV2, alpha: number): string {
  return `rgba(${appTokens.primaryRgb}, ${alpha})`
}

/**
 * Solid hex equal to the primary tint alpha-composited over the canvas.
 * Required under elevation glows: Android renders the native shadow through
 * translucent fills as a dark plate, so glowing wells need opaque pixels.
 */
export function solidTintFromPrimary(
  appTokens: AppTokensV2,
  alpha: number,
): string {
  const [pr, pg, pb] = hexChannels(appTokens.primary)
  const [br, bgC, bb] = hexChannels(appTokens.bg)
  const mix = (top: number, base: number) =>
    Math.round(top * alpha + base * (1 - alpha))
  const channel = (value: number) => value.toString(16).padStart(2, '0')
  return `#${channel(mix(pr, br))}${channel(mix(pg, bgC))}${channel(mix(pb, bb))}`
}

/**
 * Solid hex equal to the dark translucent surface alpha composited over the
 * canvas. RemoteViews and stacking-sensitive surfaces (sheets, overlays)
 * need pre-blended opaque colors instead of alpha layers.
 */
export function blendElevOverCanvas(
  appTokens: AppTokensV2,
  alpha: number,
): string {
  return blendWhiteOverHex(appTokens.bg, alpha)
}

export const shadowsV2: AppShadowsV2 = {
  shadow1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  shadow2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  shadow3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 12,
  },
}

export const shadows: AppShadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
  },
  cardParent: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  cardParentHover: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
  cardChild: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
}

export function createSurfaces(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppSurfaces {
  const appTokens = createTokensV2(colorScheme, themeMode)
  const isLight = themeMode === 'light'

  if (isLight) {
    return {
      screen: { backgroundColor: appTokens.bg },
      elevated: {
        backgroundColor: appTokens.bgElev,
        borderColor: appTokens.hairline,
        shadow: shadows.sm,
        elevation: 1,
      },
      overlay: {
        backgroundColor: appTokens.bgElev,
        borderColor: appTokens.hairlineStrong,
        shadow: shadows.md,
        elevation: 4,
      },
      sheet: {
        backgroundColor: appTokens.bgSheet,
        borderColor: appTokens.hairline,
        shadow: shadows.lg,
        elevation: 8,
      },
    }
  }

  return {
    screen: { backgroundColor: appTokens.bg },
    elevated: {
      backgroundColor: appTokens.bgElev,
      borderColor: appTokens.hairline,
      shadow: shadows.sm,
      elevation: 0,
    },
    overlay: {
      backgroundColor: blendElevOverCanvas(appTokens, 0.1),
      borderColor: appTokens.hairlineStrong,
      shadow: shadows.md,
      elevation: 4,
    },
    sheet: {
      backgroundColor: appTokens.bgSheet,
      borderColor: appTokens.hairline,
      shadow: shadows.lg,
      elevation: 8,
    },
  }
}

/**
 * Simulates `color-mix(in srgb, hex, white amount%)`.
 * amount is 0-1 (0 = original, 1 = white).
 */
export function lightenHex(hex: string, amount: number): string {
  const normalized = hex.replace('#', '')

  let r: number
  let g: number
  let b: number

  if (normalized.length === 3) {
    const [rh, gh, bh] = normalized.split('')
    r = Number.parseInt(`${rh}${rh}`, 16)
    g = Number.parseInt(`${gh}${gh}`, 16)
    b = Number.parseInt(`${bh}${bh}`, 16)
  } else if (normalized.length === 6) {
    r = Number.parseInt(normalized.slice(0, 2), 16)
    g = Number.parseInt(normalized.slice(2, 4), 16)
    b = Number.parseInt(normalized.slice(4, 6), 16)
  } else {
    return hex
  }

  const blend = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
  return `rgb(${blend(r)},${blend(g)},${blend(b)})`
}

/**
 * Simulates `color-mix(in srgb, hex, black amount%)` — the web destructive
 * pressed fill. amount is 0-1 (0 = original, 1 = black).
 */
export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexChannels(hex)
  const blend = (channel: number) => Math.round(channel * (1 - amount))
  return `rgb(${blend(r)},${blend(g)},${blend(b)})`
}
