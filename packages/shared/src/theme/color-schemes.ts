import type { ColorScheme, ColorSchemeDefinition, SchemeAccent, SchemeMode } from './types'

const grantedAccent: Record<SchemeMode, SchemeAccent> = {
  dark: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C85716',
    primaryDim: '#261611',
    primaryRgb: '196,83,15',
  },
  light: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C15109',
    primaryDim: '#F4DDD3',
    primaryRgb: '196,83,15',
  },
}
const grantedFgOnPrimary: Record<SchemeMode, string> = {
  dark: '#FFFFFF',
  light: '#FFFFFF',
}

export const schemes: Record<ColorScheme, ColorSchemeDefinition> = {
  purple: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#22094f', light: '#e9d4ff' },
  },
  blue: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#001b48', light: '#cedfff' },
  },
  green: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#012709', light: '#c4eac7' },
  },
  rose: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#40010e', light: '#ffd1d0' },
  },
  orange: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#371100', light: '#ffd3c6' },
  },
  cyan: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    gradientHeaderFrom: { dark: '#01232b', light: '#b2e8fd' },
  },
}
