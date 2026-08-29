'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { ActiveView } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { type TodayTabItem, type TodayTabView } from './today-shell'

const TAB_VIEWS = ['today', 'all', 'general'] as const

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
  }
}

export interface TodayViewState {
  currentActiveView: ActiveView
  tabItems: TodayTabItem[]
  attemptViewChange: (nextView: TodayTabView) => boolean
  viewsLabel: string
}

/**
 * Owns Today's habit tab state and builds the tab items.
 */
export function useTodayViewState(): TodayViewState {
  const t = useTranslations()
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const tabItems = useMemo<TodayTabItem[]>(
    () => TAB_VIEWS.map((view) => ({ view, label: getTodayTabLabel(view, t) })),
    [t],
  )

  const attemptViewChange = useCallback(
    (nextView: TodayTabView) => {
      setActiveView(nextView)
      return true
    },
    [setActiveView],
  )

  return {
    currentActiveView: activeView,
    tabItems,
    attemptViewChange,
    viewsLabel: t('habits.viewsLabel'),
  }
}
