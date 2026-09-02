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
  },
  blue: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
  green: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
  rose: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
  orange: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
  cyan: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
}
