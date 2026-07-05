'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, goalKeys, profileKeys, gamificationKeys } from '@orbit/shared/query'
import { applyOnboarding } from '@/app/actions/onboarding'
import { useProfile } from '@/hooks/use-profile'
import {
  useOnboardingDraftStore,
  useOnboardingDraftHydrated,
  useOnboardingHasPendingAnswers,
} from '@/stores/onboarding-draft-store'

/**
 * Flushes buffered pre-auth onboarding answers to the server after authentication.
 * Runs inside the authenticated app shell; on any 2xx the local draft is cleared and
 * the profile is marked onboarded, on failure the draft is retained for the next mount.
 */
export function useOnboardingFlush(): void {
  const queryClient = useQueryClient()
  const { patchProfile } = useProfile()
  const hydrated = useOnboardingDraftHydrated()
  const hasPendingAnswers = useOnboardingHasPendingAnswers()
  const runningRef = useRef(false)

  useEffect(() => {
    if (!hydrated || !hasPendingAnswers || runningRef.current) return

    runningRef.current = true
    const store = useOnboardingDraftStore.getState()

    void applyOnboarding(store.buildApplyPayload())
      .then(() => {
        store.reset()
        patchProfile({ hasCompletedOnboarding: true })
        queryClient.invalidateQueries({ queryKey: habitKeys.all })
        queryClient.invalidateQueries({ queryKey: goalKeys.all })
        queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
        queryClient.invalidateQueries({ queryKey: profileKeys.all })
      })
      .catch(() => {
        void 0
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [hydrated, hasPendingAnswers, patchProfile, queryClient])
}
