import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TourSection } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useProfile } from '@/hooks/use-profile'

const SEEN_KEY = 'orbit_tour_sections'

/**
 * Fires a one-time first-run coach-mark spotlight when a surface gains focus, once
 * onboarding is done, the full tour is inactive, and the surface has not been seen before.
 */
export function useCoachMark(section: TourSection) {
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
            const raw = await AsyncStorage.getItem(SEEN_KEY)
            const seen = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
            if (cancelled || seen[section] === true) return
            if (useTourStore.getState().isActive) return
            triggered.current = true
            seen[section] = true
            await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen))
            useTourStore.getState().startSectionReplay(section)
          } catch {
            return
          }
        })()
      }, 600)

      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }, [profile?.hasCompletedOnboarding, profile?.hasCompletedTour, section]),
  )
}
