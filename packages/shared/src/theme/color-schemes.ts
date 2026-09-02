import type { ColorScheme, ColorSchemeDefinition, SchemeAccent, SchemeMode } from './types'

const grantedAccent: Record<SchemeMode, SchemeAccent> = {
  dark: {
    primary: '#C4530F',
    primaryHover: '#b74e12',
    primaryPressed: '#a24716',
    primarySoft: '#c85716',
    primaryDim: '#261611',
    primaryRgb: '196, 83, 15',
  },
  light: {
    primary: '#C4530F',
    primaryHover: '#b74e12',
    primaryPressed: '#a24716',
    primarySoft: '#c15109',
    primaryDim: '#f4ddd3',
    primaryRgb: '196, 83, 15',
  },
}
const grantedFgOnPrimary: Record<SchemeMode, string> = {
  dark: '#ffffff',
  light: '#ffffff',
}

export const schemes: Record<ColorScheme, ColorSchemeDefinition> = {
  purple: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 265.1322,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  blue: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 233.1502,
    chromaScaleBg: 0.6226,
    chromaScaleFg: 1,
  },
  green: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 140,
    chromaScaleBg: 0.6,
    chromaScaleFg: 0.6,
  },
  rose: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 350.4196,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  orange: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 32,
    chromaScaleBg: 1,
    chromaScaleFg: 1,
  },
  cyan: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
    neutralHue: 191.8735,
    chromaScaleBg: 0.5167,
    chromaScaleFg: 0.843,
  },
}
