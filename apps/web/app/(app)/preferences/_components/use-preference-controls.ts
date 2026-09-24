'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { calendarKeys, gamificationKeys, habitKeys } from '@orbit/shared/query'
import { parseShowGeneralOnTodayPreference, resolveSystemLocale } from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useAuthStore } from '@/stores/auth-store'
import {
  updateWeekStartDay,
  updateLanguage,
  updateTimezone,
} from '@/lib/actions/profile'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { getHeldAccountId } from '@/stores/auth-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import type { PreferencePicker } from './preference-picker-sheet'

function writeLocaleCookie(value: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `i18n_locale=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
  }
}

export function usePreferenceControls() {
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { currentTheme, applyTheme } = useColorScheme()

  const [activePicker, setActivePicker] = useState<PreferencePicker | null>(null)

  useEffect(() => {
    localStorage.removeItem('orbit_time_format')
    document.cookie = 'orbit_time_format=;max-age=0;path=/;samesite=strict'
  }, [])

  const locale = useLocale()
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLocale>(() =>
    resolveSystemLocale(locale),
  )

  const handleLanguageChange = useCallback(
    async (nextLocale: SupportedLocale) => {
      const previousLocale = selectedLanguage
      const intendedAccountId = getHeldAccountId()
      setSelectedLanguage(nextLocale)
      writeLocaleCookie(nextLocale)
      if (isAuthenticated) {
        try {
          await updateLanguage({ language: nextLocale }, intendedAccountId)
        } catch (error) {
          if (reportsAccountChanged(error)) {
            showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
            return
          }
          if (getHeldAccountId() !== intendedAccountId) return
          setSelectedLanguage(previousLocale)
          writeLocaleCookie(previousLocale)
          return
        }
      }
      globalThis.location.reload()
    },
    [isAuthenticated, selectedLanguage, showPersistentError, t],
  )

  const weekStartMutation = useAccountScopedMutation({
    mutationFn: (day: 0 | 1, intendedAccountId) =>
      updateWeekStartDay({ weekStartDay: day }, intendedAccountId),
    onMutate: (day) => {
      const previous = profile?.weekStartDay
      patchProfile({ weekStartDay: day })
      return { previous }
    },
    onError: (_err, _day, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ weekStartDay: context.previous })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })

  const timeZoneMutation = useAccountScopedMutation({
    mutationFn: (timeZone: string, intendedAccountId) =>
      updateTimezone({ timeZone }, intendedAccountId),
    onMutate: (timeZone) => {
      const previous = profile?.timeZone ?? null
      patchProfile({ timeZone })
      return { previous }
    },
    onError: (_error, _timeZone, context) => {
      patchProfile({ timeZone: context?.previous ?? null })
    },
    onSettled: async () => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all })
      await queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      await queryClient.invalidateQueries({ queryKey: gamificationKeys.all, refetchType: 'none' })
      await queryClient.invalidateQueries({ queryKey: habitKeys.all })
    },
  })

  function handleThemeModeChange(mode: ThemeMode) {
    if (mode === currentTheme) return
    applyTheme(mode)
  }

  const [showGeneralOnToday, setShowGeneralOnToday] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  })

  function toggleShowGeneral() {
    const next = !showGeneralOnToday
    setShowGeneralOnToday(next)
    localStorage.setItem('orbit_show_general_on_today', String(next))
  }

  return {
    profile,
    currentTheme,
    activePicker,
    setActivePicker,
    selectedLanguage,
    showGeneralOnToday,
    handleLanguageChange,
    handleThemeModeChange,
    toggleShowGeneral,
    timeZoneMutation,
    weekStartMutation,
  }
}
