'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ActiveView } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { getTodayTabLabel, type TodayTabItem, type TodayTabView } from './today-shell'

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const

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
    [hasProAccess, router, setActiveView],
  )

  useEffect(() => {
    if (!hasProAccess && activeView === 'goals') {
      setActiveView('today')
    }
  }, [activeView, hasProAccess, setActiveView])

  return {
    currentActiveView,
    hasProAccess,
    tabItems,
    attemptViewChange,
    viewsLabel: t('habits.viewsLabel'),
  }
}
