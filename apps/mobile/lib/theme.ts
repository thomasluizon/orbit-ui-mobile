import { schemes, type ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'

type ThemeValues = (typeof schemes)[ColorScheme]['dark']

type ThemeRuntime = {
  scheme: ColorScheme
  themeMode: ThemeMode
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
    const red = parseInt(expanded.slice(0, 2), 16)
    const green = parseInt(expanded.slice(2, 4), 16)
    const blue = parseInt(expanded.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }

  if (normalized.length === 6) {
    const red = parseInt(normalized.slice(0, 2), 16)
    const green = parseInt(normalized.slice(2, 4), 16)
    const blue = parseInt(normalized.slice(4, 6), 16)
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
) {
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
  } as const
}

export function createNav(
  colorScheme: ColorScheme = runtimeTheme.scheme,
  themeMode: ThemeMode = runtimeTheme.themeMode,
) {
  const definition = schemes[colorScheme]
  const theme = definition[themeMode]
  const primary = themeMode === 'light' ? definition.primaryLight : definition.primary
  return {
    activeColor: primary,
    inactiveColor: theme.textMuted,
    tabBarBg: theme.navGlassBg,
    tabBarBorder: theme.navGlassBorder,
  } as const
}

export const colors = new Proxy({} as ReturnType<typeof createColors>, {
  get: (_target, prop) => createColors()[prop as keyof ReturnType<typeof createColors>],
}) as ReturnType<typeof createColors>

export const nav = new Proxy({} as ReturnType<typeof createNav>, {
  get: (_target, prop) => createNav()[prop as keyof ReturnType<typeof createNav>],
}) as ReturnType<typeof createNav>

// ---------------------------------------------------------------------------
// Radius presets
// ---------------------------------------------------------------------------

export const radius = {
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

export const shadows = {
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
