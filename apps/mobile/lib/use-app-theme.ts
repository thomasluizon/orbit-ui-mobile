import { useMemo } from 'react'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  createSurfaces,
  getRuntimeTheme,
  radius,
  shadows,
} from '@/lib/theme'
import { useThemeContext, type ThemeContextValue } from '@/lib/theme-provider'

export function useAppTheme(): ThemeContextValue {
  const themeContext = useThemeContext()

  return useMemo(() => {
    if (themeContext) return themeContext

    const { scheme, themeMode } = getRuntimeTheme()

    return {
      currentScheme: scheme,
      currentTheme: themeMode,
      surfaces: createSurfaces(scheme, themeMode),
      radius,
      shadows,
      applyTheme: (_theme: ThemeMode) => {},
      toggleTheme: () => {},
    }
  }, [themeContext])
}
