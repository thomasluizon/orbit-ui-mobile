import { useMemo } from 'react'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  createColors,
  createNav,
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
      colors: createColors(scheme, themeMode),
      nav: createNav(scheme, themeMode),
      surfaces: createSurfaces(scheme, themeMode),
      radius,
      shadows,
      applyScheme: (_scheme: ColorScheme) => {},
      applyTheme: (_theme: ThemeMode) => {},
      toggleTheme: () => {},
    }
  }, [themeContext])
}
