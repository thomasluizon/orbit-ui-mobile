import type { ColorScheme, ColorSchemeDefinition, SchemeAccent, SchemeMode } from './types'

const grantedAccent: Record<SchemeMode, SchemeAccent> = {
  dark: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C85716',
    primaryText: '#ED773E',
    primaryDim: '#261611',
    primaryRgb: '196,83,15',
  },
  light: {
    primary: '#C4530F',
    primaryHover: '#B74E12',
    primaryPressed: '#A24716',
    primarySoft: '#C15109',
    primaryText: '#A63A00',
    primaryDim: '#F4DDD3',
    primaryRgb: '196,83,15',
  },
}
const grantedFgOnPrimary: Record<SchemeMode, string> = {
  dark: '#FFFFFF',
  light: '#FFFFFF',
}

export const schemes = {
  orange: {
    accent: grantedAccent,
    fgOnPrimary: grantedFgOnPrimary,
  },
} satisfies Partial<Record<ColorScheme, ColorSchemeDefinition>>
