'use client'

import { useEffect, useState } from 'react'
import type { Profile } from '@orbit/shared/types/profile'
import { resolveOnboardingPlan } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'

type PlanState = { plan: 'Free' | 'Pro' | 'Trial' | 'loading' | null; profile: Profile | undefined }

export function useOnboardingPlan() {
  const { profile, refetch } = useProfile()
  const { isOnline } = useOffline()
  const [cachedProfile] = useState(profile)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PlanState>({ plan: 'loading', profile: undefined })
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      if (!isOnline) {
        if (!cancelled) setState({ profile: cachedProfile, plan: resolveOnboardingPlan(cachedProfile, true) })
        return
      }
      const result = await refetch()
      if (cancelled) return
      const currentProfile = result.data ?? cachedProfile
      setState({ profile: currentProfile, plan: resolveOnboardingPlan(currentProfile, result.isError) })
    }
    void refresh()
    return () => { cancelled = true }
  }, [attempt, cachedProfile, isOnline, refetch])
  function retry() {
    setState({ plan: 'loading', profile: undefined })
    setAttempt((current) => current + 1)
  }
  return { ...state, retry }
}
