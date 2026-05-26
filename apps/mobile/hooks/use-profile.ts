import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { profileKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import {
  getCurrentPlan,
  getIsYearlyPro,
  getTrialDaysLeft,
  getTrialExpired,
  getTrialUrgent,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

async function fetchProfile(): Promise<Profile> {
  return apiClient<Profile>(API.profile.get)
}

export function useProfile() {
  const queryClient = useQueryClient()
  const { i18n } = useTranslation()

  const query = useQuery({
    queryKey: profileKeys.detail(),
    queryFn: fetchProfile,
    staleTime: QUERY_STALE_TIMES.profile,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const profile = query.data
  const profileLanguage = profile?.language

  useEffect(() => {
    if (!profileLanguage) return
    if (i18n.language === profileLanguage) return
    void i18n.changeLanguage(profileLanguage)
  }, [profileLanguage, i18n])

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
