export type ColorScheme = 'purple' | 'blue' | 'green' | 'rose' | 'orange' | 'cyan'

export type SchemeMode = 'dark' | 'light'

export interface SchemeAccent {
  primary: string
  primaryPressed: string
  primaryRgb: string
}

export interface ColorSchemeDefinition {
  accent: Record<SchemeMode, SchemeAccent>
  fgOnPrimary: Record<SchemeMode, string>
  /** Accent-text token per mode, L-only-derived to clear the text floor on the scheme canvas. */
  primarySoft: Record<SchemeMode, string>
  neutralHue: number
  chromaScaleBg: number
  chromaScaleFg: number
}
