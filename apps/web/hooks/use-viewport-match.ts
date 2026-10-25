'use client'

import { useMemo, useSyncExternalStore } from 'react'

function createViewportMatch(query: string) {
  return {
    subscribe: (callback: () => void): (() => void) => {
      if (typeof window === 'undefined') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    getSnapshot: (): boolean => {
      return window.matchMedia(query).matches
    },
  }
}

function getServerSnapshot(): boolean {
  return false
}

export function useViewportMatch(query: string): boolean {
  const match = useMemo(() => createViewportMatch(query), [query])
  return useSyncExternalStore(match.subscribe, match.getSnapshot, getServerSnapshot)
}
