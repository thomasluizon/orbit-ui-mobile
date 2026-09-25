'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import * as Sentry from '@sentry/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, goalKeys, profileKeys, gamificationKeys } from '@orbit/shared/query'
import { applyOnboarding } from '@/lib/actions/onboarding'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { useProfile } from '@/hooks/use-profile'
import { subscribeToPushNotifications } from '@/hooks/use-push-notification-preferences'
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
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const hydrated = useOnboardingDraftHydrated()
  const hasPendingAnswers = useOnboardingHasPendingAnswers()
  const pushPermissionGranted = useOnboardingDraftStore((state) => state.pushPermissionGranted)
  const pushRegistrationFailed = useOnboardingDraftStore((state) => state.pushRegistrationFailed)
  const runningRef = useRef(false)

  const shouldFlush =
    hydrated && hasPendingAnswers && !pushRegistrationFailed && !!profile && !profile.hasCompletedOnboarding

  useEffect(() => {
    if (!shouldFlush || runningRef.current) return

    runningRef.current = true
    const store = useOnboardingDraftStore.getState()
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const stillCurrent = () => getHeldAccountId() === intendedAccountId
      && getAccountGeneration() === accountGeneration

    let onboardingApplied = false
    void applyOnboarding(store.buildApplyPayload(), intendedAccountId)
      .then(async () => {
        if (!stillCurrent()) return
        onboardingApplied = true
        if (pushPermissionGranted) {
          const push = await subscribeToPushNotifications()
          if (push.status !== 'registered') throw new Error('Failed to register deferred push subscription')
        }
        if (!stillCurrent()) return
        store.reset()
        patchProfile({ hasCompletedOnboarding: true })
        void queryClient.invalidateQueries({ queryKey: habitKeys.all })
        void queryClient.invalidateQueries({ queryKey: goalKeys.all })
        void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      })
      .catch((error: unknown) => {
        if (reportsAccountChanged(error)) {
          showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'), t('errorScreen.reload'))
          return
        }
        if (!stillCurrent()) return
        if (onboardingApplied && pushPermissionGranted) store.markPushRegistrationFailed()
        Sentry.captureException(error)
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [patchProfile, pushPermissionGranted, queryClient, shouldFlush, showPersistentError, t])
}
