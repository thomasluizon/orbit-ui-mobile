import type { StyleProp, ViewStyle } from 'react-native'

export interface OrbitWidgetModuleType {
  saveToken(token: string): Promise<void>
  clearToken(): Promise<void>
  syncTheme(colorScheme: string, themeMode: string): Promise<void>
  refresh(): Promise<void>
}

export type OnLoadEventPayload = {
  url: string
}

export type OrbitWidgetViewProps = {
  url: string
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void
  style?: StyleProp<ViewStyle>
}
