'use client'

import { Moon, Sun } from '@/components/ui/icons'
import * as Primitive from '@radix-ui/react-toggle'
import { useTranslations } from 'next-intl'
import { useColorScheme } from '@/hooks/use-color-scheme'

/** Header circle button bound to the theme mode: moon in dark, sun in light. */
export function ThemeToggle() {
  const t = useTranslations()
  const { currentTheme, toggleTheme } = useColorScheme()
  const isDark = currentTheme === 'dark'

  return (
    <Primitive.Root
      pressed={isDark}
      onPressedChange={toggleTheme}
      aria-label={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
      className="icon-btn icon-btn-ring icon-btn-well"
    >
      {isDark ? (
        <Moon size={20} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Sun size={20} strokeWidth={1.8} aria-hidden="true" />
      )}
    </Primitive.Root>
  )
}
