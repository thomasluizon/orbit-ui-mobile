'use client'

import { Moon, Sun } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/icon-button'
import { useTranslations } from 'next-intl'
import { useColorScheme } from '@/hooks/use-color-scheme'

export function ThemeToggle() {
  const t = useTranslations()
  const { currentTheme, toggleTheme } = useColorScheme()
  const isDark = currentTheme === 'dark'

  return (
    <IconButton
      data-theme-toggle=""
      label={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={20} strokeWidth={2} aria-hidden="true" /> : <Moon size={20} strokeWidth={2} aria-hidden="true" />}
    </IconButton>
  )
}
