import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/settings-row'
import { useAppTheme } from '@/lib/use-app-theme'

/** Kit Switch bound to the theme mode: on = dark. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { currentTheme, toggleTheme } = useAppTheme()
  const isDark = currentTheme === 'dark'

  return (
    <Switch
      on={isDark}
      onToggle={toggleTheme}
      accessibilityLabel={
        isDark
          ? t('settings.theme.switchToLight')
          : t('settings.theme.switchToDark')
      }
    />
  )
}
