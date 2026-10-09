'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { getBackLabel } from '@orbit/shared/utils/back-label'
import { readAppNavigationHistory, subscribeAppNavigationHistory } from '@/lib/app-navigation-history'

function getBackRoute(fallbackRoute: string): string {
  const { entries, index } = readAppNavigationHistory()
  const currentEntry = `${globalThis.location.pathname}${globalThis.location.search}`
  const previousEntry = entries[entries[index] === currentEntry ? index - 1 : index]
  if (previousEntry) return previousEntry
  if (globalThis.history.length > 1 && globalThis.document.referrer) {
    try {
      const referrer = new URL(globalThis.document.referrer)
      if (referrer.origin === globalThis.location.origin) return referrer.pathname
    } catch {
    }
  }
  return fallbackRoute
}

export function useBackLabel(fallbackRoute: string): string {
  const t = useTranslations()
  const route = useSyncExternalStore(subscribeAppNavigationHistory, () => getBackRoute(fallbackRoute), () => fallbackRoute)
  return getBackLabel(route, t)
}
