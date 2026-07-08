'use client'

import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 768px)'
const WIDE_DESKTOP_QUERY = '(min-width: 1024px)'

function createViewportMatch(query: string) {
  return {
    subscribe: (callback: () => void): (() => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    getSnapshot: (): boolean => {
      return window.matchMedia(query).matches
    },
  }
}

const desktopMatch = createViewportMatch(DESKTOP_QUERY)
const wideDesktopMatch = createViewportMatch(WIDE_DESKTOP_QUERY)

function getServerSnapshot(): boolean {
  return false
}

/**
 * Returns true once the viewport is at or above the 768px desktop breakpoint.
 *
 * SSR-safe via useSyncExternalStore: the server snapshot is always false, so the
 * desktop-only surfaces never render below 768px or during hydration.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(desktopMatch.subscribe, desktopMatch.getSnapshot, getServerSnapshot)
}

/**
 * Returns true once the viewport is at or above the 1024px wide-desktop breakpoint,
 * where the calendar month view swaps its day-detail overlay for the persistent
 * inline side panel. Same SSR-safe semantics as useIsDesktop.
 */
export function useIsWideDesktop(): boolean {
  return useSyncExternalStore(
    wideDesktopMatch.subscribe,
    wideDesktopMatch.getSnapshot,
    getServerSnapshot,
  )
}
