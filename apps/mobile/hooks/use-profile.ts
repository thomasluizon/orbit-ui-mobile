import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import i18n from 'i18next'
import { profileKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// useProfile -- TanStack Query hook for the user profile (mobile)
// ---------------------------------------------------------------------------

async function fetchProfile(): Promise<Profile> {
  return apiClient<Profile>('/api/profile')
}

export function useProfile() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: profileKeys.detail(),
    queryFn: fetchProfile,
    staleTime: QUERY_STALE_TIMES.profile,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const profile = query.data

  // Sync i18n language from profile (matches web's cookie-based locale sync)
  useEffect(() => {
    if (!profile?.language) return
    if (i18n.language !== profile.language) {
      i18n.changeLanguage(profile.language)
    }
  }, [profile?.language])

  // Auto-detect timezone: if backend says UTC and device has a real timezone, fix it
  useEffect(() => {
    if (!profile) return
    const tz = profile.timeZone
    if (!tz || tz === 'UTC') {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected && detected !== 'UTC') {
        apiClient('/api/profile/timezone', {
          method: 'PUT',
          body: JSON.stringify({ timeZone: detected }),
        })
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
  return useMemo(() => {
    if (!profile?.trialEndsAt) return null
    return Math.max(0, differenceInCalendarDays(parseISO(profile.trialEndsAt), new Date()))
  }, [profile?.trialEndsAt])
}

/** Computed: readable plan label. */
export function useCurrentPlan(): 'Free' | 'Pro' | 'Trial' {
  const { profile } = useProfile()
  return useMemo(() => {
    if (!profile) return 'Free'
    if (profile.isTrialActive) return 'Trial'
    if (profile.hasProAccess) return 'Pro'
    return 'Free'
  }, [profile])
}

/** Computed: trial has ended and user is on free plan. */
export function useTrialExpired(): boolean {
  const { profile } = useProfile()
  return useMemo(() => {
    if (!profile) return false
    return profile.trialEndsAt !== null && !profile.isTrialActive && profile.plan === 'free'
  }, [profile])
}

/** Computed: trial is ending within 2 days. */
export function useTrialUrgent(): boolean {
  const trialDaysLeft = useTrialDaysLeft()
  return trialDaysLeft !== null && trialDaysLeft <= 2
}

/** Computed: user is on a yearly Pro plan or lifetime. */
export function useIsYearlyPro(): boolean {
  const { profile } = useProfile()
  return useMemo(() => {
    if (!profile) return false
    return profile.hasProAccess && (profile.isLifetimePro || profile.subscriptionInterval === 'yearly')
  }, [profile])
}
