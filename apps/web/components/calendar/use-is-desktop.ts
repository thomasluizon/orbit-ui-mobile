'use client'

import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 768px)'

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Returns true once the viewport is at or above the 768px desktop breakpoint.
 *
 * SSR-safe via useSyncExternalStore: the server snapshot is always false, so the
 * desktop-only calendar surfaces never render below 768px or during hydration.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
