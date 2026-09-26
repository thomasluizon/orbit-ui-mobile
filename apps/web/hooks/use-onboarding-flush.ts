'use client'

import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, goalKeys, profileKeys, gamificationKeys } from '@orbit/shared/query'
import { applyOnboarding } from '@/lib/actions/onboarding'
import { captureAccountIntent, reportAccountChanged } from '@/lib/client-action'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useProfile } from '@/hooks/use-profile'
import {
  useOnboardingDraftStore,
  useOnboardingDraftHydrated,
  useOnboardingHasPendingAnswers,
} from '@/stores/onboarding-draft-store'

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
    const intent = captureAccountIntent()

    void intent.run(() => applyOnboarding(store.buildApplyPayload()))
      .then(() => {
        if (!intent.stillCurrent()) return
        store.reset()
        patchProfile({ hasCompletedOnboarding: true })
        void queryClient.invalidateQueries({ queryKey: habitKeys.all })
        void queryClient.invalidateQueries({ queryKey: goalKeys.all })
        void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      })
      .catch((error: unknown) => {
        if (reportsAccountChanged(error)) reportAccountChanged()
        if (!intent.stillCurrent()) return
        Sentry.captureException(error)
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [patchProfile, queryClient, shouldFlush])
}
