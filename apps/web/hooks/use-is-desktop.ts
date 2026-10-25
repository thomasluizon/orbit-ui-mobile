'use client'

import { useViewportMatch } from './use-viewport-match'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'

const DESKTOP_QUERY = '(min-width: 768px)'
const WIDE_DESKTOP_QUERY = `(min-width: ${WIDE_DESKTOP_BREAKPOINT}px)`

/**
 * Returns true once the viewport is at or above the 768px desktop breakpoint.
 *
 * SSR-safe via useSyncExternalStore: the server snapshot is always false, so the
 * desktop-only surfaces never render below 768px or during hydration.
 */
export function useIsDesktop(): boolean {
  return useViewportMatch(DESKTOP_QUERY)
}

/**
 * Returns true once the viewport is at or above the 1024px wide-desktop breakpoint,
 * where the calendar month view swaps its day-detail overlay for the persistent
 * inline side panel. Same SSR-safe semantics as useIsDesktop.
 */
export function useIsWideDesktop(): boolean {
  return useViewportMatch(WIDE_DESKTOP_QUERY)
}
