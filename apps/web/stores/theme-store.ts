'use client'

import { useSyncExternalStore } from 'react'
import type { ThemeMode } from '@orbit/shared'
import { readClientCookie, writeClientCookie } from '@/lib/client-cookie'
import { normalizeThemeMode, resolveInitialTheme } from '@/lib/theme-dom'

const listeners = new Set<() => void>()

export function getSavedTheme(): ThemeMode | null {
  if (typeof document === 'undefined') return null
  const saved = readClientCookie('orbit_theme_mode')
  try {
    return resolveInitialTheme(saved ? decodeURIComponent(saved) : null)
  } catch {
    return null
  }
}

export function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark'
  return normalizeThemeMode(document.documentElement.style.colorScheme || getSavedTheme())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setCurrentTheme(theme: ThemeMode, persist = true) {
  if (persist) writeClientCookie('orbit_theme_mode', theme)
  document.documentElement.style.setProperty('color-scheme', theme)
  for (const listener of listeners) listener()
}

export function useCurrentTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, getCurrentTheme, () => 'dark')
}
