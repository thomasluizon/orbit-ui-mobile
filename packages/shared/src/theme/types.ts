export type ColorScheme = 'purple' | 'blue' | 'green' | 'rose' | 'orange' | 'cyan'

export type SchemeMode = 'dark' | 'light'

export interface SchemeAccent {
  primary: string
  primaryPressed: string
  primaryRgb: string
}

export interface ColorSchemeDefinition {
  accent: Record<SchemeMode, SchemeAccent>
  neutralHue: number
  chromaScaleBg: number
  chromaScaleFg: number
  gradientHeaderFrom: Record<SchemeMode, string>
}
