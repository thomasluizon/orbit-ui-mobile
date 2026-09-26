import { useEffect, useRef, useState } from 'react'
import { API } from '@orbit/shared/api'
import {
  canSnapshotOnboardingEntry,
  resolveRetainedOnboarding,
} from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { useProfile } from '@/hooks/use-profile'

export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
): boolean {
  const { patchProfile } = useProfile()
  const { count, isLoaded } = useHabitCountLoaded()
  const [hadHabitsAtEntry, setHadHabitsAtEntry] = useState<boolean | null>(null)
  const autoCompletedRef = useRef(false)

  if (
    hadHabitsAtEntry === null &&
    canSnapshotOnboardingEntry({
      hasCompletedOnboarding: profile?.hasCompletedOnboarding,
      suppressed,
      habitCountLoaded: isLoaded,
    })
  ) {
    setHadHabitsAtEntry(count > 0)
  }

  const action = resolveRetainedOnboarding({
    hasCompletedOnboarding: profile?.hasCompletedOnboarding,
    hadHabitsAtEntry,
  })

  useEffect(() => {
    if (action !== 'autocomplete' || autoCompletedRef.current) return
    autoCompletedRef.current = true
    void (async () => {
      try {
        await performQueuedApiMutation({
          type: 'completeOnboarding',
          scope: 'profile',
          endpoint: API.profile.onboarding,
          method: 'PUT',
          payload: undefined,
          dedupeKey: 'profile-onboarding-complete',
        })
      } catch {}
      patchProfile({ hasCompletedOnboarding: true })
    })()
  }, [action, patchProfile])

  return action === 'show'
}
