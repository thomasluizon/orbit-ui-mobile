'use client'

import { useEffect, useRef } from 'react'
import { useTourStore } from '@/stores/tour-store'
import { useProfile } from '@/hooks/use-profile'

const COACH_TOUR_SEEN_KEY = 'orbit_coach_tour_seen'

function readCoachTourSeen(): boolean {
  try {
    return localStorage.getItem(COACH_TOUR_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

function markCoachTourSeen() {
  try {
    localStorage.setItem(COACH_TOUR_SEEN_KEY, 'true')
  } catch {
    return
  }
}

/**
 * Fires the one-time first-run coach-mark tour once onboarding is done, the full tour
 * is inactive, and it has not run before. Walks the connected coach sequence
 * (today, calendar, astra) as a single multi-step tour.
 */
export function useCoachTour() {
  const { profile } = useProfile()
  const triggered = useRef(false)

  useEffect(() => {
    if (triggered.current) return
    if (!profile?.hasCompletedOnboarding || profile.hasCompletedTour) return
    if (useTourStore.getState().isActive) return
    if (readCoachTourSeen()) return

    triggered.current = true
    const timer = setTimeout(() => {
      if (useTourStore.getState().isActive) return
      markCoachTourSeen()
      useTourStore.getState().startCoachTour()
    }, 600)
    return () => clearTimeout(timer)
  }, [profile?.hasCompletedOnboarding, profile?.hasCompletedTour])
}
