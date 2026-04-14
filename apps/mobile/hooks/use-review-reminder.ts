import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native'
import * as StoreReview from 'expo-store-review'
import { formatAPIDate } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { useReviewReminderStore } from '@/stores/review-reminder-store'
import { useUIStore } from '@/stores/ui-store'

const FALLBACK_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.useorbit.app'

export function useReviewReminder(profile?: Profile | null) {
  const completionCount = useReviewReminderStore((s) => s.completionCount)
  const activeDays = useReviewReminderStore((s) => s.activeDays)
  const dismissedUntil = useReviewReminderStore((s) => s.dismissedUntil)
  const acceptedAt = useReviewReminderStore((s) => s.acceptedAt)
  const dismissStore = useReviewReminderStore((s) => s.dismiss)
  const acceptStore = useReviewReminderStore((s) => s.accept)
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const queuedCelebrations = useUIStore((s) => s.queuedCelebrations)
  const queuedCelebrationCount = queuedCelebrations?.length ?? 0
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState)
    })

    return () => subscription.remove()
  }, [])

  const shouldShow = useMemo(() => {
    const today = formatAPIDate(new Date())
    const isForeground = appState === 'active'

    if (!profile?.hasCompletedOnboarding) return false
    if (completionCount < 20 || activeDays.length < 5) return false
    if (acceptedAt) return false
    if (dismissedUntil && dismissedUntil >= today) return false
    if (!isForeground) return false
    if (activeCelebration || queuedCelebrationCount > 0) return false

    return true
  }, [
    acceptedAt,
    activeCelebration,
    activeDays.length,
    appState,
    completionCount,
    dismissedUntil,
    profile?.hasCompletedOnboarding,
    queuedCelebrationCount,
  ])

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
    shouldShow,
    completionCount,
    activeDaysCount: activeDays.length,
    dismiss,
    requestReview,
  }
}
