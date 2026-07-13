'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ActiveView } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { type TodayTabItem, type TodayTabView } from './today-shell'

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const

function getTodayTabLabel(
  view: TodayTabView,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (view) {
    case 'today':
      return t('habits.viewToday')
    case 'all':
      return t('habits.viewAll')
    case 'general':
      return t('habits.viewGeneral')
    case 'goals':
      return t('goals.tab')
  }
}

export interface TodayViewState {
  currentActiveView: ActiveView
  hasProAccess: boolean
  tabItems: TodayTabItem[]
  attemptViewChange: (nextView: TodayTabView) => boolean
  viewsLabel: string
}

/**
 * Owns Today's tab/view state: gates the goals tab behind pro access, builds the
 * tab items, and recovers a stale free-tier goals view back to today. Pure
 * extraction of TodayPage.
 */
export function useTodayViewState(): TodayViewState {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const hasProAccess = profile?.hasProAccess ?? false
  const currentActiveView = !hasProAccess && activeView === 'goals' ? 'today' : activeView

  const tabItems = useMemo<TodayTabItem[]>(
    () => TAB_VIEWS.map((view) => ({ view, label: getTodayTabLabel(view, t) })),
    [t],
  )

  const attemptViewChange = useCallback(
    (nextView: TodayTabView) => {
      if (nextView === 'goals' && !hasProAccess) {
        router.push('/upgrade')
        return false
      }

      setActiveView(nextView)
      return true
    },
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess is derived from profile.hasProAccess every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [hasProAccess, router, setActiveView],
  )

  useEffect(() => {
    if (!hasProAccess && activeView === 'goals') {
      setActiveView('today')
    }
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess is derived from profile.hasProAccess every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [activeView, hasProAccess, setActiveView])

  return {
    currentActiveView,
    hasProAccess,
    tabItems,
    attemptViewChange,
    viewsLabel: t('habits.viewsLabel'),
  }
}
