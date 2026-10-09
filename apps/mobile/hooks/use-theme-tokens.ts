import { useMemo } from 'react'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function useThemeTokens() {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
}
