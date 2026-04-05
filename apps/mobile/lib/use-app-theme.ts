import { useMemo } from 'react'
import type { ColorScheme } from '@orbit/shared/theme'
import { useProfile } from '@/hooks/use-profile'
import { createColors, createNav, radius, shadows } from '@/lib/theme'

const colorSchemes: ColorScheme[] = ['purple', 'blue', 'green', 'rose', 'orange', 'cyan']

function normalizeColorScheme(value: string | null | undefined): ColorScheme {
  return colorSchemes.includes(value as ColorScheme) ? (value as ColorScheme) : 'purple'
}

export function useAppTheme() {
  const { profile } = useProfile()
  const scheme = normalizeColorScheme(profile?.colorScheme)

  return useMemo(() => ({
    scheme,
    colors: createColors(scheme),
    nav: createNav(scheme),
    radius,
    shadows,
  }), [scheme])
}
