import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTourStore } from '@/stores/tour-store'
import { useProfile } from '@/hooks/use-profile'
import { accountStorageKey } from '@/lib/account-storage-key'
import { useAccountId } from '@/lib/account-scope'

const COACH_TOUR_SEEN_KEY = 'orbit_coach_tour_seen'

/**
 * Fires the one-time first-run coach-mark tour when the home surface gains focus, once
 * onboarding is done, the full tour is inactive, and it has not run before. Walks the
 * connected coach sequence (today, calendar, astra) as a single multi-step tour.
 */
export function useCoachTour() {
  const { profile } = useProfile()
  const accountId = useAccountId()
  const triggeredAccountId = useRef<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (triggeredAccountId.current === accountId && accountId !== null) return
      if (!profile?.hasCompletedOnboarding || profile.hasCompletedTour) return
      if (useTourStore.getState().isActive) return

      let cancelled = false
      const timer = setTimeout(() => {
        void (async () => {
          try {
            const storageKey = accountStorageKey(COACH_TOUR_SEEN_KEY)
            const raw = await AsyncStorage.getItem(storageKey)
            if (cancelled || raw === 'true') return
            if (useTourStore.getState().isActive) return
            triggeredAccountId.current = accountId
            await AsyncStorage.setItem(storageKey, 'true')
            useTourStore.getState().startCoachTour()
          } catch {
            return
          }
        })()
      }, 600)

      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }, [accountId, profile]),
  )
}
