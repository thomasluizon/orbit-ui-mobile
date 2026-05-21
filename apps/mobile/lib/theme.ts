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
  surfaceGround: string
  surface: string
  surfaceElevated: string
  surfaceOverlay: string
  border: string
  borderMuted: string
  borderEmphasis: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  textFaded: string
  textInverse: string
  primary: string
  primary400: string
  primaryLight: string
  primaryShadow: string
  primary_10: string
  primary_15: string
  primary_20: string
  primary_30: string
  primary_80: string
  primaryTintBg: string
  primaryTintBorder: string
  primaryTintIconBg: string
  primaryRing: string
  textFaded40: string
  border50: string
  borderFaded30: string
  borderDivider: string
  success: string
  warning: string
  danger: string
  white: string
  red: string
  red400: string
  red500: string
  redLight: string
  redBg: string
  redBorder: string
  red400_10: string
  red500_10: string
  red500_30: string
  amber: string
  amber400: string
  amber500: string
  amberDark: string
  green: string
  green400: string
  green500: string
  green500bg: string
  green500_60: string
  emerald: string
  emerald400: string
  emeraldBg: string
  emeraldBorder: string
  emerald400_10: string
  emerald500_10: string
  emerald500_20: string
  emerald500_30: string
  blue: string
  blue400: string
  blue500: string
  orange500: string
  orange400: string
  orange300: string
  orange500_30: string
  orange400_10: string
  handle: string
  purple: string
}

export interface AppNav {
  activeColor: string
  inactiveColor: string
  tabBarBg: string
  tabBarBorder: string
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
  glow: (color: string) => ShadowValue
  glowSm: (color: string) => ShadowValue
  glowLg: (color: string) => ShadowValue
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
    ambientStart: string
    ambientEnd: string
  }
  ground: AppSurfaceLayer
  card: AppSurfaceLayer
  elevated: AppSurfaceLayer
  overlay: AppSurfaceLayer
  primaryTint: AppSurfaceLayer
  glow: {
    subtle: ShadowValue
    base: ShadowValue
    strong: ShadowValue
  }
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

function blendRgbOverHex(
  rgb: string,
  opacity: number,
  backgroundHex: string,
  fallback: string,
): string {
  const channels = rgb
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
  const normalized = backgroundHex.replace('#', '')

  if (channels.length !== 3 || channels.some((value) => Number.isNaN(value))) {
    return fallback
  }

  if (normalized.length !== 6) {
    return fallback
  }

  const backgroundRed = Number.parseInt(normalized.slice(0, 2), 16)
  const backgroundGreen = Number.parseInt(normalized.slice(2, 4), 16)
  const backgroundBlue = Number.parseInt(normalized.slice(4, 6), 16)

  const [foregroundRed, foregroundGreen, foregroundBlue] = channels as [
    number,
    number,
    number,
  ]
  const blendChannel = (foreground: number, background: number) =>
    Math.round(foreground * opacity + background * (1 - opacity))

  return `rgb(${blendChannel(foregroundRed, backgroundRed)}, ${blendChannel(foregroundGreen, backgroundGreen)}, ${blendChannel(foregroundBlue, backgroundBlue)})`
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export function createColors(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppColors {
  const definition = schemes[colorScheme]
  const theme = definition[themeMode]
  const alpha = (opacity: number) => `rgba(${definition.shadowRgb}, ${opacity})`
  const isLight = themeMode === 'light'
  const primary =
    themeMode === 'light' ? definition.primaryLight : definition.primary
  const flattenedTint = (opacity: number, fallback: string) =>
    blendRgbOverHex(definition.shadowRgb, opacity, theme.background, fallback)

  return {
    background: theme.background,
    surfaceGround: theme.surfaceGround,
    surface: theme.surface,
    surfaceElevated: theme.surfaceElevated,
    surfaceOverlay: theme.surfaceOverlay,
    primary,
    primary400: definition.scale[400] ?? primary,
    primaryLight: alpha(0.2),
    primaryShadow: `rgba(${definition.shadowRgb},`,
    primary_10: alpha(0.1),
    primary_15: alpha(0.15),
    primary_20: alpha(0.2),
    primary_30: alpha(0.3),
    primary_80: alpha(0.8),
    // Android renders semi-transparent elevated cards inconsistently in light
    // mode, so flatten the tint over the page background while keeping the
    // same visual result as the web overlay tokens.
    primaryTintBg: isLight
      ? flattenedTint(0.3, 'rgb(215, 200, 252)')
      : alpha(0.1),
    primaryTintBorder: isLight
      ? flattenedTint(0.5, 'rgb(194, 169, 251)')
      : alpha(0.2),
    primaryTintIconBg: isLight
      ? flattenedTint(0.42, 'rgb(202, 181, 251)')
      : alpha(0.2),
    primaryRing: alpha(0.3),
    textPrimary: theme.textPrimary,
    textSecondary: theme.textSecondary,
    textMuted: theme.textMuted,
    textFaded: theme.textFaded,
    textFaded40: withAlpha(
      theme.textFaded,
      0.4,
      isLight ? 'rgba(122, 116, 144, 0.40)' : 'rgba(165, 156, 186, 0.40)',
    ),
    textInverse: theme.textInverse,
    border: theme.border,
    borderMuted: theme.borderMuted,
    borderEmphasis: theme.borderEmphasis,
    border50: withAlpha(
      theme.textPrimary,
      isLight ? 0.06 : 0.035,
      isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.035)',
    ),
    borderFaded30: withAlpha(
      theme.textFaded,
      0.3,
      isLight ? 'rgba(122, 116, 144, 0.30)' : 'rgba(165, 156, 186, 0.30)',
    ),
    borderDivider: withAlpha(
      theme.textPrimary,
      isLight ? 0.05 : 0.02,
      isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.02)',
    ),
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    white: '#ffffff',
    red: '#ef4444',
    red400: '#f87171',
    red500: '#ef4444',
    redLight: '#f87171',
    redBg: 'rgba(248, 113, 113, 0.1)',
    redBorder: 'rgba(248, 113, 113, 0.3)',
    red400_10: 'rgba(248, 113, 113, 0.10)',
    red500_10: 'rgba(248, 113, 113, 0.10)',
    red500_30: 'rgba(248, 113, 113, 0.30)',
    amber: '#f59e0b',
    amber400: '#fbbf24',
    amber500: '#f59e0b',
    amberDark: '#d97706',
    green: '#22c55e',
    green400: '#4ade80',
    green500: '#22c55e',
    green500bg: 'rgba(34, 197, 94, 1)',
    green500_60: 'rgba(34, 197, 94, 0.60)',
    emerald: '#34d399',
    emerald400: '#34d399',
    emeraldBg: 'rgba(52, 211, 153, 0.1)',
    emeraldBorder: 'rgba(52, 211, 153, 0.3)',
    emerald400_10: 'rgba(52, 211, 153, 0.10)',
    emerald500_10: 'rgba(52, 211, 153, 0.10)',
    emerald500_20: 'rgba(52, 211, 153, 0.20)',
    emerald500_30: 'rgba(52, 211, 153, 0.30)',
    blue: '#3b82f6',
    blue400: '#60a5fa',
    blue500: '#3b82f6',
    orange500: '#f97316',
    orange400: '#fb923c',
    orange300: '#fdba74',
    orange500_30: 'rgba(249, 115, 22, 0.30)',
    orange400_10: 'rgba(251, 146, 60, 0.10)',
    handle: withAlpha(
      theme.textPrimary,
      isLight ? 0.12 : 0.15,
      isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.15)',
    ),
    purple: definition.scale[400] ?? definition.primary,
  }
}

export function createNav(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
): AppNav {
  const definition = schemes[colorScheme]
  const theme = definition[themeMode]
  const primary =
    themeMode === 'light' ? definition.primaryLight : definition.primary
  return {
    activeColor: primary,
    inactiveColor: theme.textMuted,
    tabBarBg: theme.navGlassBg,
    tabBarBorder: theme.navGlassBorder,
  }
}

export const colors = new Proxy({} as AppColors, {
  get: (_target, prop) => createColors()[prop as keyof AppColors],
})

export const nav = new Proxy({} as AppNav, {
  get: (_target, prop) => createNav()[prop as keyof AppNav],
})

// ---------------------------------------------------------------------------
// Radius presets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Animation tokens
// ---------------------------------------------------------------------------

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
  shimmer: motionDurations.shimmer,
  creationGlow: motionDurations.creationGlow,
  completePop: motionDurations.completePop,
  completeGlow: motionDurations.completeGlow,
  completeSpark: motionDurations.completeSpark,
}

// ---------------------------------------------------------------------------
// Shadow presets (iOS shadows -- use elevation on Android)
// ---------------------------------------------------------------------------

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
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  }),
  glowSm: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  }),
  glowLg: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
  }),
}

// ---------------------------------------------------------------------------
// Semantic surface presets
// ---------------------------------------------------------------------------

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
  const screenAmbient = isLight
    ? withAlpha(colors.primary, 0.05, 'rgba(139, 92, 246, 0.05)')
    : withAlpha(colors.primary, 0.12, 'rgba(139, 92, 246, 0.12)')
  const topHighlight = isLight
    ? withAlpha(colors.white, 0.85, 'rgba(255, 255, 255, 0.85)')
    : withAlpha(colors.white, 0.05, 'rgba(255, 255, 255, 0.05)')

  return {
    screen: {
      backgroundColor: colors.background,
      ambientStart: screenAmbient,
      ambientEnd: 'transparent',
    },
    ground: {
      backgroundColor: colors.surfaceGround,
      borderColor: colors.borderMuted,
      topHighlight,
      shadow: isLight ? createLightShadow(4, 0.035) : shadows.sm,
      elevation: isLight ? 0 : 1,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: isLight ? colors.border : colors.borderMuted,
      topHighlight,
      shadow: isLight ? createLightShadow(8, 0.06) : shadows.cardParent,
      elevation: isLight ? 1 : 5,
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
    primaryTint: {
      backgroundColor: colors.primaryTintBg,
      borderColor: colors.primaryTintBorder,
      topHighlight,
      shadow: isLight ? createLightShadow(12, 0.08) : shadows.glow(colors.primary),
      elevation: isLight ? 2 : 8,
    },
    glow: {
      subtle: shadows.glowSm(colors.primary),
      base: shadows.glow(colors.primary),
      strong: shadows.glowLg(colors.primary),
    },
  }
}

export const surfaces = new Proxy({} as AppSurfaces, {
  get: (_target, prop) => createSurfaces()[prop as keyof AppSurfaces],
})

// ---------------------------------------------------------------------------
// Gradient helpers (for use with expo-linear-gradient)
// ---------------------------------------------------------------------------

export const gradients = {
  surfaceSheen: ['rgba(255,255,255,0.035)', 'transparent'] as const,
  surfaceSheenChild: ['rgba(255,255,255,0.02)', 'transparent'] as const,
  surfaceSheenLocations: [0, 0.4] as const,
  /** Returns a 3-stop diagonal shimmer: transparent -> primary/0.15 -> transparent */
  proShimmer: (primaryRgb: string) =>
    ['transparent', `rgba(${primaryRgb},0.15)`, 'transparent'] as const,
  proShimmerLocations: [0.3, 0.5, 0.7] as const,
  /** Done-state log button: primary -> 30% white-mixed primary */
  logButtonDone: (primary: string, primaryLighter: string) =>
    [primary, primaryLighter] as const,
  /** Status side-glow: colored -> transparent horizontal */
  statusDue: ['rgba(245,158,11,0.12)', 'transparent'] as const,
  statusOverdue: ['rgba(239,68,68,0.12)', 'transparent'] as const,
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Returns an rgba string using the given rgb components (defaults to purple 139,92,246) */
export function primaryRgba(alpha: number, rgb?: string): string {
  return `rgba(${rgb ?? '139,92,246'},${alpha})`
}

// ---------------------------------------------------------------------------
// v2 tokens (redesign/v2 — Linear-tactical OKLCH system)
// Old `colors`/`surfaces`/`shadows`/`gradients` exports stay until Phase 7
// removes them after the last consumer migrates.
// ---------------------------------------------------------------------------

export interface AppTokensV2 {
  bg: string
  bgElev: string
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

// v2 shadows: 3 cool hairline-layered tiers (no glows, no color).
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
