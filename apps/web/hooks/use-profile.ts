'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import {
  getCurrentPlan,
  getIsYearlyPro,
  getTrialDaysLeft,
  getTrialExpired,
  getTrialUrgent,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { useColorScheme } from '@/hooks/use-color-scheme'

function writeLocaleCookie(value: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `i18n_locale=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
  }
}

export function useProfile() {
  const queryClient = useQueryClient()
  const locale = useLocale()
  const {
    syncSchemeFromProfile,
    syncThemeFromProfile,
    detectAndSaveSchemeIfNeeded,
    detectAndSaveThemeIfNeeded,
  } = useColorScheme()

  const query = useQuery({
    queryKey: profileKeys.detail(),
    queryFn: () => fetchJson<Profile>(API.profile.get),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: true,
  })

  const profile = query.data
  const profileLanguage = profile?.language

  useEffect(() => {
    if (!profile) return
    syncSchemeFromProfile(profile.colorScheme, profile.hasProAccess)
    syncThemeFromProfile(profile.themePreference)
    detectAndSaveSchemeIfNeeded(profile.colorScheme)
    detectAndSaveThemeIfNeeded(profile.themePreference)
  }, [
    profile,
    syncSchemeFromProfile,
    syncThemeFromProfile,
    detectAndSaveSchemeIfNeeded,
    detectAndSaveThemeIfNeeded,
  ])

  useEffect(() => {
    if (!profileLanguage || profileLanguage === locale) return
    writeLocaleCookie(profileLanguage)
    globalThis.location.reload()
  }, [profileLanguage, locale])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: profileKeys.all })
  }, [queryClient])

  const patchProfile = useCallback(
    (patch: Partial<Profile>) => {
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, ...patch } : old,
      )
    },
    [queryClient],
  )

  return {
    ...query,
    profile,
    invalidate,
    patchProfile,
  }
}

/** Computed: does the user currently have Pro-level access? */
export function useHasProAccess(): boolean {
  const { profile } = useProfile()
  return profile?.hasProAccess ?? false
}

/** Computed: how many trial days remain (null if not in trial). */
export function useTrialDaysLeft(): number | null {
  const { profile } = useProfile()
  return useMemo(() => getTrialDaysLeft(profile), [profile])
}

/** Computed: readable plan label. */
export function useCurrentPlan(): 'Free' | 'Pro' | 'Trial' {
  const { profile } = useProfile()
  return useMemo(() => getCurrentPlan(profile), [profile])
}

/** Computed: trial has ended and user is on free plan. */
export function useTrialExpired(): boolean {
  const { profile } = useProfile()
  return useMemo(() => getTrialExpired(profile), [profile])
}

/** Computed: trial is ending within 2 days. */
export function useTrialUrgent(): boolean {
  const { profile } = useProfile()
  return useMemo(() => getTrialUrgent(profile), [profile])
}

/** Computed: user is on a yearly Pro plan or lifetime. */
export function useIsYearlyPro(): boolean {
  const { profile } = useProfile()
  return useMemo(() => getIsYearlyPro(profile), [profile])
}
