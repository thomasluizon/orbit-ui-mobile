'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import type { ColorScheme } from '@orbit/shared/theme'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useAuthStore } from '@/stores/auth-store'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
  updateLanguage,
} from '@/app/actions/profile'
import type { PreferencePicker } from './preference-picker-sheet'

function writeLocaleCookie(value: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `i18n_locale=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
  }
}

export function usePreferenceControls() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { currentScheme, currentTheme, applyScheme, applyTheme } = useColorScheme()

  const [activePicker, setActivePicker] = useState<PreferencePicker | null>(null)

  useEffect(() => {
    localStorage.removeItem('orbit_time_format')
    document.cookie = 'orbit_time_format=;max-age=0;path=/;samesite=strict'
  }, [])

  const locale = useLocale()
  const [selectedLanguage, setSelectedLanguage] = useState<string>(locale)

  const handleLanguageChange = useCallback(
    async (nextLocale: SupportedLocale) => {
      const previousLocale = selectedLanguage
      setSelectedLanguage(nextLocale)
      writeLocaleCookie(nextLocale)
      if (isAuthenticated) {
        try {
          await updateLanguage({ language: nextLocale })
        } catch {
          setSelectedLanguage(previousLocale)
          writeLocaleCookie(previousLocale)
          return
        }
      }
      globalThis.location.reload()
    },
    [isAuthenticated, selectedLanguage],
  )

  const weekStartMutation = useMutation({
    mutationFn: (day: 0 | 1) => updateWeekStartDay({ weekStartDay: day }),
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

  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) => updateColorSchemeAction({ colorScheme: scheme }),
    onMutate: (scheme) => {
      const previous = profile?.colorScheme
      patchProfile({ colorScheme: scheme })
      return { previous }
    },
    onError: (_err, _scheme, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ colorScheme: context.previous })
        if (context.previous) {
          applyScheme(context.previous as ColorScheme)
        }
      }
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      setActivePicker(null)
      router.push('/upgrade')
      return
    }
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

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
    currentScheme,
    currentTheme,
    activePicker,
    setActivePicker,
    selectedLanguage,
    showGeneralOnToday,
    handleLanguageChange,
    handleSchemeChange,
    handleThemeModeChange,
    toggleShowGeneral,
    weekStartMutation,
  }
}
