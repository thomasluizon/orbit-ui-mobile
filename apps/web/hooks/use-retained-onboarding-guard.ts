'use client'

import { useEffect, useRef, useState } from 'react'
import {
  canSnapshotOnboardingEntry,
  resolveRetainedOnboarding,
} from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { completeOnboarding } from '@/lib/actions/profile'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { useProfile } from '@/hooks/use-profile'

/**
 * Decides the post-auth retained onboarding overlay for the current account. A brand-new account
 * (no habits) sees the overlay; an account that already has habits — a pre-migration user, or one
 * that abandoned onboarding after creating habits — is auto-completed instead of re-onboarded.
 * Whether the account already had habits is frozen at entry because the overlay itself creates
 * habits during the flow. Returns whether to render the overlay.
 */
export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
  forceShow = false,
): boolean {
  const { patchProfile } = useProfile()
  const { count, isLoaded } = useHabitCountLoaded()
  const [hadHabitsAtEntry, setHadHabitsAtEntry] = useState<boolean | null>(null)
  const autoCompletedRef = useRef(false)

  if (
    !forceShow &&
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
    if (forceShow || action !== 'autocomplete' || autoCompletedRef.current) return
    autoCompletedRef.current = true
    void completeOnboarding()
      .catch(() => {})
      .finally(() => patchProfile({ hasCompletedOnboarding: true }))
  }, [action, forceShow, patchProfile])

  return forceShow || action === 'show'
}
