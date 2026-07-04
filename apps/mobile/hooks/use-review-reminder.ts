import { useCallback, useMemo } from 'react'
import { Linking, Platform } from 'react-native'
import * as StoreReview from 'expo-store-review'
import { formatAPIDate } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import {
  isReviewMomentEligible,
  useReviewReminderStore,
} from '@/stores/review-reminder-store'

const FALLBACK_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.useorbit.app'

/**
 * Review-moment mechanics: eligibility (engagement floor + snooze + one-shot
 * accept) plus the native Play in-app review flow with a store-URL fallback.
 * Dismissing snoozes for 120 days; accepting never re-prompts.
 */
export function useReviewReminder(profile?: Profile | null) {
  const completionCount = useReviewReminderStore((s) => s.completionCount)
  const activeDays = useReviewReminderStore((s) => s.activeDays)
  const dismissedUntil = useReviewReminderStore((s) => s.dismissedUntil)
  const acceptedAt = useReviewReminderStore((s) => s.acceptedAt)
  const dismissStore = useReviewReminderStore((s) => s.dismiss)
  const acceptStore = useReviewReminderStore((s) => s.accept)

  const isEligible = useMemo(
    () =>
      isReviewMomentEligible(
        { completionCount, activeDays, dismissedUntil, acceptedAt },
        profile?.hasCompletedOnboarding ?? false,
        formatAPIDate(new Date()),
      ),
    [
      acceptedAt,
      activeDays,
      completionCount,
      dismissedUntil,
      profile?.hasCompletedOnboarding,
    ],
  )

  const dismiss = useCallback(() => {
    dismissStore()
  }, [dismissStore])

  const requestReview = useCallback(async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview()
        acceptStore()
        return true
      }
    } catch {}

    const fallbackUrl =
      StoreReview.storeUrl() ??
      (Platform.OS === 'android' ? FALLBACK_PLAY_STORE_URL : null)

    if (!fallbackUrl) {
      return false
    }

    try {
      await Linking.openURL(fallbackUrl)
      acceptStore()
      return true
    } catch {
      return false
    }
  }, [acceptStore])

  return {
    isEligible,
    dismiss,
    requestReview,
  }
}
