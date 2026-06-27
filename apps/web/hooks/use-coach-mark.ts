'use client'

import { useEffect, useRef } from 'react'
import type { TourSection } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useProfile } from '@/hooks/use-profile'

const SEEN_KEY = 'orbit_tour_sections'

function readSeenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function markSectionSeen(section: TourSection) {
  try {
    const seen = readSeenSections()
    seen[section] = true
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    return
  }
}

/**
 * Fires a one-time first-run coach-mark spotlight for a surface once onboarding is done,
 * the full tour is inactive, and the surface has not been seen before.
 */
export function useCoachMark(section: TourSection) {
  const { profile } = useProfile()
  const triggered = useRef(false)

  useEffect(() => {
    if (triggered.current) return
    if (!profile?.hasCompletedOnboarding || profile.hasCompletedTour) return
    if (useTourStore.getState().isActive) return
    if (readSeenSections()[section]) return

    triggered.current = true
    const timer = setTimeout(() => {
      if (useTourStore.getState().isActive) return
      markSectionSeen(section)
      useTourStore.getState().startSectionReplay(section)
    }, 600)
    return () => clearTimeout(timer)
  }, [profile?.hasCompletedOnboarding, profile?.hasCompletedTour, section])
}
