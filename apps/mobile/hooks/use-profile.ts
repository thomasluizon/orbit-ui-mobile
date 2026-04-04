import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
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
// Derived selectors
// ---------------------------------------------------------------------------

export function useHasProAccess(): boolean {
  const { profile } = useProfile()
  return profile?.hasProAccess ?? false
}

export function useTrialDaysLeft(): number | null {
  const { profile } = useProfile()
  return useMemo(() => {
    if (!profile?.trialEndsAt) return null
    return Math.max(0, differenceInCalendarDays(parseISO(profile.trialEndsAt), new Date()))
  }, [profile?.trialEndsAt])
}

export function useTrialExpired(): boolean {
  const { profile } = useProfile()
  return useMemo(() => {
    if (!profile) return false
    return profile.trialEndsAt !== null && !profile.isTrialActive && profile.plan === 'free'
  }, [profile])
}
