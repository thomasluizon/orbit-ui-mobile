export type ColorScheme = 'purple' | 'blue' | 'green' | 'rose' | 'orange' | 'cyan'

export interface ThemeValues {
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
  shadowSm: string
  shadowMd: string
  shadowLg: string
  navGlassBg: string
  navGlassBorder: string
}

export interface ColorSchemeV2Mode {
  primary: string
  primaryPressed: string
  chromaBg: number
  chromaFg: number
}

export interface ColorSchemeV2 {
  hue: number
  dark: ColorSchemeV2Mode
  light: ColorSchemeV2Mode
}

export interface ColorSchemeDefinition {
  primary: string
  primaryLight: string
  shadowRgb: string
  dark: ThemeValues
  light: ThemeValues
  scale: Record<number, string>
  v2: ColorSchemeV2
}
