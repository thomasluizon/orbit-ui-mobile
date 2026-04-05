import { schemes, type ColorScheme } from '@orbit/shared/theme'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export function createColors(colorScheme: ColorScheme = 'purple') {
  const definition = schemes[colorScheme]
  const theme = definition.dark
  const alpha = (opacity: number) => `rgba(${definition.shadowRgb}, ${opacity})`

  return {
    background: theme.background,
    surfaceGround: theme.surfaceGround,
    surface: theme.surface,
    surfaceElevated: theme.surfaceElevated,
    surfaceOverlay: theme.surfaceOverlay,
    primary: definition.primary,
    primary400: definition.scale[400] ?? definition.primary,
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
    textFaded40: theme.textFaded.replace('#', '').length === 6
      ? `${theme.textFaded}66`
      : 'rgba(165, 156, 186, 0.40)',
    textInverse: theme.textInverse,
    border: theme.border,
    borderMuted: theme.borderMuted,
    borderEmphasis: theme.borderEmphasis,
    border50: 'rgba(255,255,255,0.035)',
    borderFaded30: 'rgba(165, 156, 186, 0.30)',
    borderDivider: 'rgba(255,255,255,0.02)',
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
    handle: 'rgba(255,255,255,0.15)',
    purple: definition.scale[400] ?? definition.primary,
  } as const
}

export function createNav(colorScheme: ColorScheme = 'purple') {
  const definition = schemes[colorScheme]
  return {
    activeColor: definition.primary,
    inactiveColor: definition.dark.textMuted,
    tabBarBg: definition.dark.surfaceGround,
    tabBarBorder: definition.dark.border,
  } as const
}

export const colors = createColors()

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

// ---------------------------------------------------------------------------
// Navigation constants
// ---------------------------------------------------------------------------

export const nav = createNav()
