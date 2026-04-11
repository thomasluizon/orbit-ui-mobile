'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useMemo } from 'react'
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
import { updateTimezone } from '@/app/actions/profile'
import { fetchJson } from '@/lib/api-fetch'
import { useColorScheme } from '@/hooks/use-color-scheme'

export function useProfile() {
  const queryClient = useQueryClient()
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

  // Auto-detect timezone: if backend says UTC and browser has a real timezone, fix it
  useEffect(() => {
    if (!profile) return
    const tz = profile.timeZone
    if (!tz || tz === 'UTC') {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected && detected !== 'UTC') {
        updateTimezone({ timeZone: detected })
          .then(() => {
            queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
              old ? { ...old, timeZone: detected } : old,
            )
          })
          .catch(() => {
            // Silently ignore -- timezone update is best-effort
          })
      }
    }
  }, [profile, queryClient])

  // Hydrate color scheme and theme from DB (source of truth).
  // On first login (null values), detect and persist local/system defaults.
  useEffect(() => {
    if (!profile) return
    syncSchemeFromProfile(profile.colorScheme)
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

  // Invalidation helper for external consumers
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: profileKeys.all })
  }, [queryClient])

  // Optimistic patch helper used by mutation hooks
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

// ---------------------------------------------------------------------------
// Derived selectors -- thin hooks that select from the profile query cache
// ---------------------------------------------------------------------------

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
