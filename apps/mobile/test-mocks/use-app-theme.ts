export interface TestAppTheme {
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

export function useAppTheme(): TestAppTheme {
  return {
    colors: {
      primary: '#2563eb',
      primary_10: '#dbeafe',
      white: '#ffffff',
      textMuted: '#64748b',
      textSecondary: '#334155',
      textPrimary: '#0f172a',
      surface: '#ffffff',
      surfaceElevated: '#f8fafc',
      borderMuted: '#e2e8f0',
      amber400: '#f59e0b',
      amber500: '#d97706',
      red400: '#f87171',
      red500: '#ef4444',
      green400: '#4ade80',
      green500: '#22c55e',
      surfaceGround: '#f1f5f9',
    },
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
