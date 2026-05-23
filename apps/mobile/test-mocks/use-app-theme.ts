export interface TestAppTheme {
  currentScheme: 'purple'
  currentTheme: 'dark'
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

export function useAppTheme(): TestAppTheme {
  return {
    currentScheme: 'purple',
    currentTheme: 'dark',
    shadows: {
      sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
      },
      md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.6,
        shadowRadius: 40,
      },
    },
  }
}
