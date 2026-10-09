'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useCallback, useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import { profileKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import {
  getCurrentPlan,
  getIsYearlyPro,
  getTrialExpired,
  getTrialUrgent,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useIsClient } from '@/hooks/use-is-client'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { useAuthStore, useHeldAccountId } from '@/stores/auth-store'

export const PreloadedProfileContext = createContext<Profile | undefined>(undefined)

function writeLocaleCookie(value: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `i18n_locale=${encodeURIComponent(value)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
  }
}

export function useProfile(options?: { enabled?: boolean; initialData?: Profile }) {
  const queryClient = useQueryClient()
  const locale = useLocale()
  const isClient = useIsClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const heldAccountId = useHeldAccountId()
  const accountReady = isAuthenticated && heldAccountId !== null
  const contextProfile = useContext(PreloadedProfileContext)
  const accountGeneration = useAccountGeneration()
  const [preloadAccountGeneration] = useState(accountGeneration)
  const initialData = accountGeneration === preloadAccountGeneration
    ? options?.initialData ?? contextProfile
    : undefined
  const {
    syncThemeFromProfile,
    detectAndSaveThemeIfNeeded,
  } = useColorScheme()

  const query = useQuery({
    queryKey: profileKeys.detail(),
    queryFn: () => fetchJson<Profile>(API.profile.get),
    initialData,
    staleTime: QUERY_STALE_TIMES.profile,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: options?.enabled ?? true,
  })

  const profile = isClient ? query.data : initialData
  const profileLanguage = profile?.language

  useEffect(() => {
    if (!accountReady || !profile) return
    syncThemeFromProfile(profile.themePreference)
    detectAndSaveThemeIfNeeded(profile.themePreference)
    // react-doctor-disable-next-line exhaustive-deps -- profile selects query.data or initialData and is already in deps; react-doctor does not resolve the derived value; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [
    accountReady,
    profile,
    syncThemeFromProfile,
    detectAndSaveThemeIfNeeded,
  ])

  useEffect(() => {
    if (!accountReady || !profileLanguage || profileLanguage === locale) return
    writeLocaleCookie(profileLanguage)
    globalThis.location.reload()
    // react-doctor-disable-next-line exhaustive-deps -- profileLanguage aliases profile.language and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [accountReady, profileLanguage, locale])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: profileKeys.all })
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
    isLoading: (!isClient && !initialData) || query.isLoading,
    invalidate,
    patchProfile,
  }
}

/** Computed: does the user currently have Pro-level access? */
export function useHasProAccess(): boolean {
  const { profile } = useProfile()
  return profile?.hasProAccess ?? false
}

/** Computed: can the user see gamification surfaces (Pro, or the free-tier flag is on)? */
export function useCanViewGamification(): boolean {
  const { profile } = useProfile()
  return profile?.canViewGamification ?? false
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
