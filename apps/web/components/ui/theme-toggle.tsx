'use client'

import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/settings-row'
import { useColorScheme } from '@/hooks/use-color-scheme'

/** Kit Switch bound to the theme mode: on = dark. */
export function ThemeToggle() {
  const t = useTranslations()
  const { currentTheme, toggleTheme } = useColorScheme()
  const isDark = currentTheme === 'dark'

  return (
    <Switch
      on={isDark}
      onToggle={toggleTheme}
      ariaLabel={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
    />
  )
}
