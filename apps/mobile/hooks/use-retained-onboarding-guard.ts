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
import { useAccountGeneration } from '@/hooks/use-session-reset'

interface EntrySnapshot {
  accountGeneration: number
  hadHabits: boolean
}

/**
 * Decides the post-auth retained onboarding overlay for the current account. A brand-new account
 * (no habits) sees the overlay; an account that already has habits — a pre-migration user, or one
 * that abandoned onboarding after creating habits — is auto-completed instead of re-onboarded.
 * Whether the account already had habits is frozen at entry because the overlay itself creates
 * habits during the flow. Neither shell unmounts across an account change, so the snapshot and the
 * spent auto-complete both carry the account generation they belong to and stop counting for the
 * next account. Returns whether to render the overlay.
 */
export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
  forceShow = false,
): boolean {
  const { patchProfile } = useProfile()
  const { count, isLoaded } = useHabitCountLoaded()
  const accountGeneration = useAccountGeneration()
  const [entrySnapshot, setEntrySnapshot] = useState<EntrySnapshot | null>(null)
  const autoCompletedGeneration = useRef<number | null>(null)

  const hadHabitsAtEntry =
    entrySnapshot?.accountGeneration === accountGeneration ? entrySnapshot.hadHabits : null

  if (
    !forceShow &&
    hadHabitsAtEntry === null &&
    canSnapshotOnboardingEntry({
      hasCompletedOnboarding: profile?.hasCompletedOnboarding,
      suppressed,
      habitCountLoaded: isLoaded,
    })
  ) {
    setEntrySnapshot({ accountGeneration, hadHabits: count > 0 })
  }

  const action = resolveRetainedOnboarding({
    hasCompletedOnboarding: profile?.hasCompletedOnboarding,
    hadHabitsAtEntry,
  })

  useEffect(() => {
    if (forceShow || action !== 'autocomplete' || autoCompletedGeneration.current === accountGeneration)
      return
    autoCompletedGeneration.current = accountGeneration
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
  }, [accountGeneration, action, forceShow, patchProfile])

  return forceShow || action === 'show'
}
