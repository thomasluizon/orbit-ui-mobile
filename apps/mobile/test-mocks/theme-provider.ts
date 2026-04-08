export interface ThemeContextValue {
  colors: {
    primary: string
    primary_10: string
    white: string
    textMuted: string
    textSecondary: string
    textPrimary: string
    surface: string
    surfaceElevated: string
    borderMuted: string
    amber400: string
    amber500: string
    red400: string
    red500: string
    green400: string
    green500: string
    surfaceGround: string
  }
  shadows: {
    sm: {
      shadowColor: string
      shadowOffset: { width: number; height: number }
      shadowOpacity: number
      shadowRadius: number
    }
    md: {
      shadowColor: string
      shadowOffset: { width: number; height: number }
      shadowOpacity: number
      shadowRadius: number
    }
    lg: {
      shadowColor: string
      shadowOffset: { width: number; height: number }
      shadowOpacity: number
      shadowRadius: number
    }
  }
}

export function useThemeContext(): ThemeContextValue | null {
  return null
}
