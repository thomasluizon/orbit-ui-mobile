/**
 * Centralized design tokens for the Orbit mobile app.
 *
 * Values sourced from the purple color scheme (dark mode) defined in
 * packages/shared/src/theme/color-schemes.ts.
 *
 * Every screen and component should import from here instead of
 * defining its own local color object.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const colors = {
  // Surface hierarchy
  background: '#07060e',
  surfaceGround: '#0d0b16',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  surfaceOverlay: '#211f33',

  // Primary
  primary: '#8b5cf6',
  primary400: '#c084fc',
  primaryLight: 'rgba(139, 92, 246, 0.20)',
  primaryShadow: 'rgba(139,92,246,',
  primary_10: 'rgba(139, 92, 246, 0.10)',
  primary_15: 'rgba(139, 92, 246, 0.15)',
  primary_20: 'rgba(139, 92, 246, 0.20)',
  primary_30: 'rgba(139, 92, 246, 0.30)',
  primary_80: 'rgba(139, 92, 246, 0.80)',
  primaryRing: 'rgba(139, 92, 246, 0.30)',

  // Text hierarchy
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  textFaded: '#a59cba',
  textFaded40: 'rgba(165, 156, 186, 0.40)',
  textInverse: '#07060e',

  // Border hierarchy
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  borderEmphasis: 'rgba(255,255,255,0.12)',
  border50: 'rgba(255,255,255,0.035)',
  borderFaded30: 'rgba(165, 156, 186, 0.30)',
  borderDivider: 'rgba(255,255,255,0.02)',

  // Semantic
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  white: '#ffffff',

  // Reds
  red: '#ef4444',
  red400: '#f87171',
  red500: '#ef4444',
  redLight: '#f87171',
  redBg: 'rgba(248, 113, 113, 0.1)',
  redBorder: 'rgba(248, 113, 113, 0.3)',
  red400_10: 'rgba(248, 113, 113, 0.10)',
  red500_10: 'rgba(248, 113, 113, 0.10)',
  red500_30: 'rgba(248, 113, 113, 0.30)',

  // Ambers
  amber: '#f59e0b',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amberDark: '#d97706',

  // Greens
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

  // Blues
  blue: '#3b82f6',
  blue400: '#60a5fa',
  blue500: '#3b82f6',

  // Oranges
  orange500: '#f97316',
  orange400: '#fb923c',
  orange300: '#fdba74',
  orange500_30: 'rgba(249, 115, 22, 0.30)',
  orange400_10: 'rgba(251, 146, 60, 0.10)',

  // Handle / misc
  handle: 'rgba(255,255,255,0.15)',

  // Other
  purple: '#c084fc',
} as const

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

export const nav = {
  activeColor: '#8b5cf6',
  inactiveColor: '#7a7490',
  tabBarBg: '#0d0b16',
  tabBarBorder: 'rgba(255, 255, 255, 0.07)',
} as const
