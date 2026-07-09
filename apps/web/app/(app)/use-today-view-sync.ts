'use client'

import { useState } from 'react'

export interface TodayViewSyncParams {
  pinnedDateStr: string | null
  searchQueryStore: string
  activeView: string
  isSelectMode: boolean
  setActiveView: (view: 'today') => void
  setLocalSearchQuery: (value: string) => void
  clearSelection: () => void
}

/**
 * Render-phase view synchronisation for the Today page (adjusting-state-during-render
 * pattern): pins the "today" view when a date is deep-linked, mirrors the store search
 * into the local input, and clears the selection when the active view changes.
 * Mirrors the mobile `useTodayScreenViewSync` hook.
 */
export function useTodayViewSync({
  pinnedDateStr,
  searchQueryStore,
  activeView,
  isSelectMode,
  setActiveView,
  setLocalSearchQuery,
  clearSelection,
}: TodayViewSyncParams) {
  const [previousPinnedDateStr, setPreviousPinnedDateStr] = useState<string | null>(null)
  if (pinnedDateStr !== previousPinnedDateStr) {
    setPreviousPinnedDateStr(pinnedDateStr)
    if (pinnedDateStr) setActiveView('today')
  }

  const [previousStoreSearch, setPreviousStoreSearch] = useState(searchQueryStore)
  if (searchQueryStore !== previousStoreSearch) {
    setPreviousStoreSearch(searchQueryStore)
    setLocalSearchQuery(searchQueryStore)
  }

  const [previousActiveView, setPreviousActiveView] = useState(activeView)
  if (activeView !== previousActiveView) {
    setPreviousActiveView(activeView)
    if (isSelectMode) clearSelection()
  }
}
