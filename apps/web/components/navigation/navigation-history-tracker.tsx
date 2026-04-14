'use client'

import { useEffect, useMemo, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  createAppNavigationEntry,
  type AppNavigationAction,
  updateAppNavigationHistory,
} from '@/lib/app-navigation-history'

export function NavigationHistoryTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pendingActionRef = useRef<AppNavigationAction | null>(null)

  useEffect(() => {
    const originalPushState = globalThis.history.pushState.bind(globalThis.history)
    const originalReplaceState = globalThis.history.replaceState.bind(globalThis.history)

    function markAction(action: AppNavigationAction) {
      pendingActionRef.current = action
    }

    globalThis.history.pushState = function pushState(data, unused, url) {
      markAction('push')
      return originalPushState(data, unused, url)
    }

    globalThis.history.replaceState = function replaceState(data, unused, url) {
      markAction('replace')
      return originalReplaceState(data, unused, url)
    }

    function handlePopState() {
      markAction('pop')
    }

    globalThis.addEventListener('popstate', handlePopState)

    return () => {
      globalThis.history.pushState = originalPushState
      globalThis.history.replaceState = originalReplaceState
      globalThis.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const entry = useMemo(
    () => createAppNavigationEntry(pathname, searchParams?.toString() ?? ''),
    [pathname, searchParams],
  )

  useEffect(() => {
    const action = pendingActionRef.current ?? 'init'
    updateAppNavigationHistory(entry, action)
    pendingActionRef.current = null
  }, [entry])

  return null
}
