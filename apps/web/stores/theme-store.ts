'use client'

import { useSyncExternalStore } from 'react'
import type { ThemeMode } from '@orbit/shared'
import { normalizeThemeMode } from '@/lib/theme-dom'

const listeners = new Set<() => void>()

export function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  const match = /(?:^|; )orbit_theme_mode=([^;]*)/.exec(document.cookie)
  return normalizeThemeMode(document.documentElement.style.colorScheme || (match?.[1] ? decodeURIComponent(match[1]) : null))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setCurrentTheme(theme: ThemeMode) {
  document.cookie = `orbit_theme_mode=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Strict; Secure`
  document.documentElement.style.setProperty('color-scheme', theme)
  for (const listener of listeners) listener()
}

export function useCurrentTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, getCurrentTheme, () => 'dark')
}
