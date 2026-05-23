export interface ThemeContextValue {
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
