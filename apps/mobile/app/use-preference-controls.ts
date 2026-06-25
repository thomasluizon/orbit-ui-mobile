import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import {
  parseShowGeneralOnTodayPreference,
  resolveSystemLocale,
} from '@orbit/shared/utils'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useAppTheme } from '@/lib/use-app-theme'
import type { PreferencePicker } from './preferences-sections'

export function usePreferenceControls() {
  const { i18n } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const { applyScheme, applyTheme, currentTheme, currentScheme } = useAppTheme()

  const [activePicker, setActivePicker] = useState<PreferencePicker | null>(null)

  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'pt-BR'>(() =>
    resolveSystemLocale(i18n.language),
  )
  const [previousProfileLanguage, setPreviousProfileLanguage] = useState(
    profile?.language,
  )
  if (profile?.language !== previousProfileLanguage) {
    setPreviousProfileLanguage(profile?.language)
    if (profile?.language) {
      setSelectedLanguage(profile.language === 'pt-BR' ? 'pt-BR' : 'en')
    }
  }

  async function handleLanguageChange(locale: 'en' | 'pt-BR') {
    const previousLanguage = selectedLanguage
    setSelectedLanguage(locale)
    i18n.changeLanguage(locale)
    try {
      await performQueuedApiMutation({
        type: 'setLanguage',
        scope: 'profile',
        endpoint: API.profile.language,
        method: 'PUT',
        payload: { language: locale },
        dedupeKey: 'profile-language',
      })
      patchProfile({ language: locale })
    } catch {
      setSelectedLanguage(previousLanguage)
      i18n.changeLanguage(previousLanguage)
    }
  }

  const weekStartMutation = useMutation({
    mutationFn: (day: 0 | 1) =>
      performQueuedApiMutation({
        type: 'setWeekStartDay',
        scope: 'profile',
        endpoint: API.profile.weekStartDay,
        method: 'PUT',
        payload: { weekStartDay: day },
        dedupeKey: 'profile-week-start-day',
      }),
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
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      setActivePicker(null)
      router.push(buildUpgradeHref('/preferences'))
      return
    }
    applyScheme(scheme)
  }

  function handleThemeModeChange(mode: ThemeMode) {
    if (mode === currentTheme) return
    applyTheme(mode)
  }

  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)

  useEffect(() => {
    void AsyncStorage.removeItem('orbit_time_format')
    AsyncStorage.getItem('orbit_show_general_on_today')
      .then((saved) => {
        setShowGeneralOnToday(parseShowGeneralOnTodayPreference(saved))
      })
      .catch(() => {
        setShowGeneralOnToday(false)
      })
  }, [])

  async function handleShowGeneralToggle(nextValue: boolean) {
    setShowGeneralOnToday(nextValue)
    try {
      await AsyncStorage.setItem(
        'orbit_show_general_on_today',
        String(nextValue),
      )
    } catch {
      setShowGeneralOnToday(!nextValue)
    }
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
    handleShowGeneralToggle,
    weekStartMutation,
  }
}
