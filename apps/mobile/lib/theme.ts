import {
  schemes,
  motionDurations,
  motionEasings,
  type ColorScheme,
} from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { oklchToHex, oklchToRgba } from './oklch'

type ThemeRuntime = {
  scheme: ColorScheme
  themeMode: ThemeMode
}

export interface AppColors {
  background: string
  surfaceElevated: string
  surfaceOverlay: string
  border: string
  borderEmphasis: string
  primary: string
  white: string
}

export interface AppRadius {
  sm: number
  md: number
  lg: number
  xl: number
  '2xl': number
  full: number
}

export interface AppSpacing {
  pageX: number
  pageBottom: number
  sectionGap: number
  cardPadding: number
  cardGap: number
  itemGap: number
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
  topHighlight: string
  shadow: ShadowValue
  elevation: number
}

export interface AppSurfaces {
  screen: {
    backgroundColor: string
  }
  elevated: AppSurfaceLayer
  overlay: AppSurfaceLayer
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

function withAlpha(color: string, opacity: number, fallback: string): string {
  const normalized = color.replace('#', '')

  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('')
    const expanded = `${r}${r}${g}${g}${b}${b}`
    const red = Number.parseInt(expanded.slice(0, 2), 16)
    const green = Number.parseInt(expanded.slice(2, 4), 16)
    const blue = Number.parseInt(expanded.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }

  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16)
    const green = Number.parseInt(normalized.slice(2, 4), 16)
    const blue = Number.parseInt(normalized.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }

  return fallback
}

export function createColors(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppColors {
  const definition = schemes[colorScheme]
  // Legacy surface/border tokens resolve to the canonical OKLCH values via
  // createTokensV2 so createSurfaces keeps emitting the shared neutrals without
  // a per-field rewrite. Direct callers of createTokensV2 get the same values.
  const v8 = createTokensV2(colorScheme, themeMode)
  const primary =
    themeMode === 'light' ? definition.primaryLight : definition.primary

  return {
    background: v8.bg,
    surfaceElevated: v8.bgElev,
    surfaceOverlay: v8.bgElev,
    border: v8.hairline,
    borderEmphasis: v8.hairlineStrong,
    primary,
    white: '#ffffff',
  }
}

export const colors = new Proxy({} as AppColors, {
  get: (_target, prop) => createColors()[prop as keyof AppColors],
})

export const radius: AppRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const

export const spacing: AppSpacing = {
  pageX: 20,
  pageBottom: 40,
  sectionGap: 16,
  cardPadding: 20,
  cardGap: 12,
  itemGap: 8,
} as const

/** Raw bezier control points for use with Easing.bezier(...) */
export const easings = {
  spring: motionEasings.emphasize,
  out: motionEasings.enter,
  smooth: motionEasings.standard,
}

export const durations = {
  fast: motionDurations.fast,
  base: motionDurations.route,
  slow: motionDurations.slow,
}

export const shadows: AppShadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
  },
  cardParent: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
  },
  cardParentHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  cardChild: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
}

function createLightShadow(radiusValue: number, opacity: number): ShadowValue {
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: Math.max(1, Math.round(radiusValue / 4)) },
    shadowOpacity: opacity,
    shadowRadius: radiusValue,
  }
}

export function createSurfaces(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppSurfaces {
  const colors = createColors(colorScheme, themeMode)
  const isLight = themeMode === 'light'
  const topHighlight = isLight
    ? withAlpha(colors.white, 0.85, 'rgba(255, 255, 255, 0.85)')
    : withAlpha(colors.white, 0.05, 'rgba(255, 255, 255, 0.05)')

  return {
    screen: {
      backgroundColor: colors.background,
    },
    elevated: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.border,
      topHighlight,
      shadow: isLight ? createLightShadow(12, 0.075) : shadows.md,
      elevation: isLight ? 2 : 7,
    },
    overlay: {
      backgroundColor: colors.surfaceOverlay,
      borderColor: colors.borderEmphasis,
      topHighlight,
      shadow: isLight ? createLightShadow(18, 0.1) : shadows.lg,
      elevation: isLight ? 8 : 16,
    },
  }
}

export const surfaces = new Proxy({} as AppSurfaces, {
  get: (_target, prop) => createSurfaces()[prop as keyof AppSurfaces],
})

export const gradients = {
  surfaceSheen: ['rgba(255,255,255,0.035)', 'transparent'] as const,
  surfaceSheenChild: ['rgba(255,255,255,0.02)', 'transparent'] as const,
  surfaceSheenLocations: [0, 0.4] as const,
  /** Done-state log button: primary -> 30% white-mixed primary */
  logButtonDone: (primary: string, primaryLighter: string) =>
    [primary, primaryLighter] as const,
  /** Status side-glow: colored -> transparent horizontal */
  statusDue: ['rgba(245,158,11,0.12)', 'transparent'] as const,
  statusOverdue: ['rgba(239,68,68,0.12)', 'transparent'] as const,
}

export interface AppTokensV2 {
  bg: string
  bgElev: string
  /** Subtle lift from `bgElev` for press/active states. Matches web's
   *  `color-mix(in oklch, var(--bg-elev), var(--fg-1) 4%)`. */
  bgElevPressed: string
  bgSunk: string
  hairline: string
  hairlineStrong: string
  fg1: string
  fg2: string
  fg3: string
  fg4: string
  fgOnPrimary: string
  primary: string
  primaryPressed: string
  statusDone: string
  statusEmpty: string
  statusSkip: string
  statusOverdue: string
  statusBad: string
  statusFrozen: string
  selectionBg: string
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

export function createTokensV2(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppTokensV2 {
  const def = schemes[colorScheme]
  const { hue } = def.v2
  const modeDef = def.v2[themeMode]
  const { primary, primaryPressed, chromaBg, chromaFg } = modeDef
  const isLight = themeMode === 'light'

  if (isLight) {
    return {
      bg: oklchToHex(0.985, chromaBg, hue),
      bgElev: oklchToHex(0.995, chromaBg, hue),
      bgElevPressed: oklchToHex(0.963, chromaBg, hue),
      bgSunk: oklchToHex(0.965, chromaBg, hue),
      hairline: oklchToHex(0.905, chromaBg * 1.4, hue),
      hairlineStrong: oklchToHex(0.84, chromaBg * 1.6, hue),
      fg1: oklchToHex(0.205, chromaFg, hue),
      fg2: oklchToHex(0.4, chromaFg, hue),
      fg3: oklchToHex(0.55, chromaFg, hue),
      fg4: oklchToHex(0.68, chromaFg, hue),
      fgOnPrimary: '#fcfcfc',
      primary,
      primaryPressed,
      statusDone: primary,
      statusEmpty: oklchToHex(0.78, chromaBg, hue),
      statusSkip: oklchToHex(0.62, chromaFg, hue),
      statusOverdue: oklchToHex(0.62, 0.13, 60),
      statusBad: oklchToHex(0.55, 0.14, 20),
      statusFrozen: oklchToHex(0.62, 0.09, 235),
      selectionBg: oklchToHex(0.92, chromaBg * 1.6, hue),
    }
  }

  return {
    bg: oklchToHex(0.16, 0.012, hue),
    bgElev: oklchToHex(0.2, 0.014, hue),
    bgElevPressed: oklchToHex(0.23, 0.014, hue),
    bgSunk: oklchToHex(0.13, 0.01, hue),
    hairline: oklchToRgba(0.965, 0.014, hue, 0.08),
    hairlineStrong: oklchToRgba(0.965, 0.014, hue, 0.16),
    fg1: oklchToHex(0.965, 0.014, hue),
    fg2: oklchToHex(0.74, 0.014, hue),
    fg3: oklchToHex(0.58, 0.014, hue),
    fg4: oklchToHex(0.42, 0.012, hue),
    fgOnPrimary: '#fcfcfc',
    primary,
    primaryPressed,
    statusDone: primary,
    statusEmpty: oklchToHex(0.42, 0.012, hue),
    statusSkip: oklchToHex(0.58, 0.014, hue),
    statusOverdue: oklchToHex(0.74, 0.1, 60),
    statusBad: oklchToHex(0.65, 0.12, 20),
    statusFrozen: oklchToHex(0.72, 0.07, 235),
    selectionBg: oklchToHex(0.32, 0.018, hue),
  }
}

export const tokens = new Proxy({} as AppTokensV2, {
  get: (_target, prop) => createTokensV2()[prop as keyof AppTokensV2],
})

// Three cool hairline-layered shadow tiers (no glows, no color).
// Mobile picks the dominant layer; elevation gives Android the same depth.
export const shadowsV2: AppShadowsV2 = {
  shadow1: {
    shadowColor: '#0f1016',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  shadow2: {
    shadowColor: '#0f1016',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  shadow3: {
    shadowColor: '#0f1016',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 10,
  },
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
