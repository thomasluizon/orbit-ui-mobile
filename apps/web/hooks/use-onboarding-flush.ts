'use client'

import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
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
 * Flushes buffered pre-auth onboarding answers to the server after authentication, but only
 * for an account that has not yet completed onboarding. On any 2xx the local draft is cleared
 * and the profile is marked onboarded; on failure the draft is retained for the next mount and
 * the error is reported. Gating on `hasCompletedOnboarding === false` prevents a guest's
 * buffered answers from being posted onto a different, already-onboarded account.
 */
export function useOnboardingFlush(): void {
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const hydrated = useOnboardingDraftHydrated()
  const hasPendingAnswers = useOnboardingHasPendingAnswers()
  const runningRef = useRef(false)

  const shouldFlush =
    hydrated && hasPendingAnswers && !!profile && !profile.hasCompletedOnboarding

  useEffect(() => {
    if (!shouldFlush || runningRef.current) return

    runningRef.current = true
    const store = useOnboardingDraftStore.getState()

    void applyOnboarding(store.buildApplyPayload())
      .then(() => {
        store.reset()
        patchProfile({ hasCompletedOnboarding: true })
        void queryClient.invalidateQueries({ queryKey: habitKeys.all })
        void queryClient.invalidateQueries({ queryKey: goalKeys.all })
        void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      })
      .catch((error: unknown) => {
        Sentry.captureException(error)
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [patchProfile, queryClient, shouldFlush])
}
