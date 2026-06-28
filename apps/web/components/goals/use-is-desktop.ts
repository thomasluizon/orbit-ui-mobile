'use client'

import { useEffect, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 768px)'

/** Tracks whether the viewport is at or above the md (768px) breakpoint. Returns
 *  false during SSR and the first client render so hydration stays stable, then
 *  resolves to the live match once mounted. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const query = window.matchMedia(DESKTOP_QUERY)
    const sync = () => setIsDesktop(query.matches)

    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return isDesktop
}
