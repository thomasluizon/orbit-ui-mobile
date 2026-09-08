import type { StyleProp, ViewStyle } from 'react-native'

/**
 * Resolved hex/rgba color tokens the Android widget reads from SharedPreferences.
 * Keys match the native `WidgetColors` fields one-to-one; values are CSS color
 * strings (`#rrggbb`, `#aarrggbb`, or `rgba(r, g, b, a)`) parsed natively.
 */
export interface WidgetThemeColors {
  background: string
  surface: string
  surfaceGround: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
  borderMuted: string
  overdue: string
  streak: string
  statusEmpty: string
}

export type WidgetThemeMode = 'dark' | 'light'
export type WidgetThemePreferenceKey = `${WidgetThemeMode}_${keyof WidgetThemeColors}`
export type WidgetThemePreferences = Record<WidgetThemePreferenceKey, string>

export interface OrbitWidgetModuleType {
  saveToken(token: string): Promise<void>
  clearToken(): Promise<void>
  syncTheme(colors: WidgetThemePreferences): Promise<void>
  syncWidgetData(json: string): Promise<void>
}

export type OnLoadEventPayload = {
  url: string
}

export type OrbitWidgetViewProps = {
  url: string
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void
  style?: StyleProp<ViewStyle>
}
