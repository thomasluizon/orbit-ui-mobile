import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTourStore } from '@/stores/tour-store'
import { useProfile } from '@/hooks/use-profile'

const COACH_TOUR_SEEN_KEY = 'orbit_coach_tour_seen'

/**
 * Fires the one-time first-run coach-mark tour when the home surface gains focus, once
 * onboarding is done, the full tour is inactive, and it has not run before. Walks the
 * connected coach sequence (today, calendar, astra) as a single multi-step tour.
 */
export function useCoachTour() {
  const { profile } = useProfile()
  const triggered = useRef(false)

  useFocusEffect(
    useCallback(() => {
      if (triggered.current) return
      if (!profile?.hasCompletedOnboarding || profile.hasCompletedTour) return
      if (useTourStore.getState().isActive) return

      let cancelled = false
      const timer = setTimeout(() => {
        void (async () => {
          try {
            const raw = await AsyncStorage.getItem(COACH_TOUR_SEEN_KEY)
            if (cancelled || raw === 'true') return
            if (useTourStore.getState().isActive) return
            triggered.current = true
            await AsyncStorage.setItem(COACH_TOUR_SEEN_KEY, 'true')
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
    }, [profile?.hasCompletedOnboarding, profile?.hasCompletedTour]),
  )
}
