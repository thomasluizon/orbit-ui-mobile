'use client'

import { useEffect, useRef, useState } from 'react'
import {
  canSnapshotOnboardingEntry,
  resolveRetainedOnboarding,
} from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { completeOnboarding } from '@/lib/actions/profile'
import { getHeldAccountId } from '@/stores/auth-store'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { useProfile } from '@/hooks/use-profile'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { useTranslations } from 'next-intl'


interface EntrySnapshot {
  accountGeneration: number
  hadHabits: boolean
}

/**
 * Decides the post-auth retained onboarding overlay for the current account. A brand-new
 * account (no habits) sees the overlay; an account that already has habits — a pre-migration
 * user, or one that abandoned onboarding after creating habits — is auto-completed instead
 * of re-onboarded.
 */
export function useRetainedOnboardingGuard(
  profile: Profile | null | undefined,
  suppressed: boolean,
  forceShow = false,
): boolean {
  const { patchProfile } = useProfile()
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
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
    const intendedAccountId = getHeldAccountId()
    const stillCurrent = () => getHeldAccountId() === intendedAccountId
      && getAccountGeneration() === accountGeneration
    void completeOnboarding(intendedAccountId)
      .then(() => {
        if (stillCurrent()) patchProfile({ hasCompletedOnboarding: true })
      })
      .catch((error: unknown) => {
        if (reportsAccountChanged(error)) {
          showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
        } else if (stillCurrent()) {
          patchProfile({ hasCompletedOnboarding: true })
        }
      })
  }, [accountGeneration, action, forceShow, patchProfile, showPersistentError, t])


  return forceShow || action === 'show'
}
