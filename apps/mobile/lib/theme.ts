import { schemes, type ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'

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
  const primary = themeMode === 'light' ? definition.primaryLight : definition.primary

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
  const primary = themeMode === 'light' ? definition.primaryLight : definition.primary
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
} as const
