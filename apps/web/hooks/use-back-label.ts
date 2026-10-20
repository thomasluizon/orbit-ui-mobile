'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { getBackLabel } from '@orbit/shared/utils/back-label'
import { subscribeAppNavigationHistory } from '@/lib/app-navigation-history'
import { getBackNavigation } from '@/lib/back-navigation'

export function useBackLabel(fallbackRoute: string): string {
  const t = useTranslations()
  const route = useSyncExternalStore(subscribeAppNavigationHistory, () => getBackNavigation(fallbackRoute).route, () => fallbackRoute)
  return getBackLabel(route, t)
}
