'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import {
  type ColorScheme,
  type ThemeMode,
} from '@orbit/shared'
import {
  updateThemePreference as updateThemePreferenceAction,
} from '@/lib/actions/profile'
import {
  applyThemeTokensToDOM,
  normalizeThemeMode,
} from '@/lib/theme-dom'
import { getHeldAccountId } from '@/stores/auth-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useIsClient } from '@/hooks/use-is-client'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge = 60 * 60 * 24 * 365) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

export function useColorScheme() {
  const queryClient = useQueryClient()
  const isClient = useIsClient()
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const currentScheme: ColorScheme = 'orange'
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() =>
    normalizeThemeMode(typeof document === 'undefined' ? null : document.documentElement.style.colorScheme || getCookie('orbit_theme_mode')),
  )

  useEffect(() => {
    setCookie('orbit_color_scheme', currentScheme)
    setCookie('orbit_theme_mode', currentTheme)
    applyThemeTokensToDOM(currentScheme, currentTheme, false)
  }, [currentScheme, currentTheme])

  const applyTheme = useCallback((theme: ThemeMode, persistToDb = true) => {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const prev = currentTheme
    const previousProfile = queryClient.getQueryData<Profile>(profileKeys.detail())
    queryClient.setQueryData<Profile>(profileKeys.detail(), (profile) =>
      profile ? { ...profile, themePreference: theme } : profile,
    )
    setCookie('orbit_theme_mode', theme)
    setCurrentTheme(theme)
    applyThemeTokensToDOM(currentScheme, theme, true)

    if (persistToDb) {
      updateThemePreferenceAction({ themePreference: theme }, intendedAccountId).catch((error: unknown) => {
        if (reportsAccountChanged(error)) {
          showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
          return
        }
        if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) return
        queryClient.setQueryData<Profile>(profileKeys.detail(), (profile) =>
          profile && previousProfile ? { ...profile, themePreference: previousProfile.themePreference } : profile,
        )
        setCookie('orbit_theme_mode', prev)
        setCurrentTheme(prev)
        applyThemeTokensToDOM(currentScheme, prev, true)
      })
    }
  }, [currentScheme, currentTheme, queryClient, showPersistentError, t])

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  }, [currentTheme, applyTheme])


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
        showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
      }
    })
  }, [currentScheme, showPersistentError, t])

  return {
    currentScheme,
    currentTheme: isClient ? currentTheme : 'dark',
    applyTheme,
    toggleTheme,
    syncThemeFromProfile,
    detectAndSaveThemeIfNeeded,
  }
}
