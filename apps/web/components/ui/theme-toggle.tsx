'use client'

import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useColorScheme } from '@/hooks/use-color-scheme'

/** Header circle button bound to the theme mode: moon in dark, sun in light. */
export function ThemeToggle() {
  const t = useTranslations()
  const { currentTheme, toggleTheme } = useColorScheme()
  const isDark = currentTheme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
      className="icon-btn icon-btn-ring icon-btn-well"
    >
      {isDark ? (
        <Moon size={20} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Sun size={20} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  )
}
