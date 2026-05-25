'use client'

import { Sun, Moon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useColorScheme } from '@/hooks/use-color-scheme'

/** v8 icon button: 36x36, no fill, single fg-2 icon. */
export function ThemeToggle() {
  const t = useTranslations()
  const { currentTheme, toggleTheme } = useColorScheme()
  const isDark = currentTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? t('settings.theme.switchToLight') : t('settings.theme.switchToDark')}
      onClick={toggleTheme}
      className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center text-[var(--fg-2)] transition-[background-color,color] duration-150 ease-out hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]"
      style={{ width: 36, height: 36, borderRadius: 8 }}
    >
      {isDark ? (
        <Sun size={17} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Moon size={17} strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  )
}
