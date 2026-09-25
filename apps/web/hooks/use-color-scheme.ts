'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  resolveAccessibleColorScheme,
  type ColorScheme,
  type ThemeMode,
} from '@orbit/shared'
import {
  updateColorScheme as updateColorSchemeAction,
  updateThemePreference as updateThemePreferenceAction,
} from '@/lib/actions/profile'
import {
  applyThemeTokensToDOM,
  normalizeColorScheme,
  normalizeThemeMode,
} from '@/lib/theme-dom'
import { getHeldAccountId } from '@/stores/auth-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { getAccountGeneration } from '@/lib/session-epoch'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge = 60 * 60 * 24 * 365) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

export function useColorScheme() {
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const [currentScheme, setCurrentScheme] = useState<ColorScheme>(() =>
    normalizeColorScheme(getCookie('orbit_color_scheme')),
  )
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() =>
    normalizeThemeMode(getCookie('orbit_theme_mode')),
  )

  useEffect(() => {
    applyThemeTokensToDOM(currentScheme, currentTheme, false)
  }, [currentScheme, currentTheme])

  const applyScheme = useCallback((scheme: ColorScheme, persistToDb = true) => {
    const intendedAccountId = getHeldAccountId()
    setCookie('orbit_color_scheme', scheme)
    setCurrentScheme(scheme)
    applyThemeTokensToDOM(scheme, currentTheme, true)

    if (persistToDb) {
      updateColorSchemeAction({ colorScheme: scheme }, intendedAccountId).catch((error: unknown) => {
        if (reportsAccountChanged(error)) {
          showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
        }
      })
    }
  }, [currentTheme, showPersistentError, t])

  const applyTheme = useCallback((theme: ThemeMode, persistToDb = true) => {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const prev = currentTheme
    setCookie('orbit_theme_mode', theme)
    setCurrentTheme(theme)
    applyThemeTokensToDOM(currentScheme, theme, true)

    if (persistToDb) {
      updateThemePreferenceAction({ themePreference: theme }, intendedAccountId).catch((error: unknown) => {
        if (reportsAccountChanged(error)) {
          showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
          return
        }
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) return
        setCookie('orbit_theme_mode', prev)
        setCurrentTheme(prev)
        applyThemeTokensToDOM(currentScheme, prev, true)
      })
    }
  }, [currentScheme, currentTheme, showPersistentError, t])

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  }, [currentTheme, applyTheme])

  /**
   * Sync cookie with DB value (DB is source of truth).
   * Call this after profile loads to ensure cross-device sync.
   */
  const syncSchemeFromProfile = useCallback((
    dbColorScheme: string | null,
    hasProAccess = true,
  ) => {
    const dbScheme = dbColorScheme
      ? resolveAccessibleColorScheme(normalizeColorScheme(dbColorScheme), hasProAccess)
      : null
    if (dbScheme && dbScheme !== currentScheme) {
      setCookie('orbit_color_scheme', dbScheme)
      setCurrentScheme(dbScheme)
      applyThemeTokensToDOM(dbScheme, currentTheme)
    }
  }, [currentScheme, currentTheme])

  /**
   * First-login detection: if DB colorScheme is null, save current
   * cookie value (default purple) so future logins are consistent.
   */
  const detectAndSaveSchemeIfNeeded = useCallback((dbColorScheme: string | null) => {
    if (dbColorScheme !== null) return
    updateColorSchemeAction({ colorScheme: currentScheme }, getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) {
        showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
      }
    })
  }, [currentScheme, showPersistentError, t])

  /**
   * Sync cookie with DB value (DB is source of truth).
   * Call this after profile loads to ensure cross-device sync.
   */
  const syncThemeFromProfile = useCallback((dbThemePreference: string | null | undefined) => {
    const dbTheme: ThemeMode | null =
      dbThemePreference === 'dark' || dbThemePreference === 'light'
        ? dbThemePreference
        : null
    if (dbTheme && dbTheme !== currentTheme) {
      setCookie('orbit_theme_mode', dbTheme)
      setCurrentTheme(dbTheme)
      applyThemeTokensToDOM(currentScheme, dbTheme)
    }
  }, [currentScheme, currentTheme])

  /**
   * First-login detection: if DB themePreference is missing, detect
   * system preference, apply it locally, and persist to DB so future
   * logins are consistent across devices.
   */
  const detectAndSaveThemeIfNeeded = useCallback((dbThemePreference: string | null | undefined) => {
    if (dbThemePreference === 'dark' || dbThemePreference === 'light') return
    const detected: ThemeMode =
      globalThis.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    setCookie('orbit_theme_mode', detected)
    setCurrentTheme(detected)
    applyThemeTokensToDOM(currentScheme, detected)
    updateThemePreferenceAction({ themePreference: detected }, getHeldAccountId()).catch((error: unknown) => {
      if (reportsAccountChanged(error)) {
        showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
      }
    })
  }, [currentScheme, showPersistentError, t])

  return {
    currentScheme,
    currentTheme,
    applyScheme,
    applyTheme,
    toggleTheme,
    syncSchemeFromProfile,
    detectAndSaveSchemeIfNeeded,
    syncThemeFromProfile,
    detectAndSaveThemeIfNeeded,
  }
}
