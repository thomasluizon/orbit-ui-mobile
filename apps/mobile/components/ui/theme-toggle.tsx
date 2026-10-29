import { Moon, Sun } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/icon-button'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { currentTheme, toggleTheme } = useAppTheme()
  const isDark = currentTheme === 'dark'

  return (
    <IconButton
      label={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={20} strokeWidth={2} accessible={false} /> : <Moon size={20} strokeWidth={2} accessible={false} />}
    </IconButton>
  )
}
