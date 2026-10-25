'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { getMediaQuery, mediaQueryMatches } from '@/lib/media-query'

function createViewportMatch(query: string) {
  return {
    subscribe: (callback: () => void): (() => void) => {
      if (typeof window === 'undefined') return () => {}
      const mql = getMediaQuery(query)
      if (!mql) return () => {}
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    getSnapshot: (): boolean => {
      return mediaQueryMatches(query)
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
