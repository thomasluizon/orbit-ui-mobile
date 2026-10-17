'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHabitViewSearch } from '@/hooks/use-habit-view-search'
import type { ActiveView } from '@orbit/shared/stores'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useTodayNavigation, type TodayNavigation } from './use-today-navigation'
import { useTodayHabitsData, type TodayHabitsData } from './use-today-habits-data'
import { useTodaySelection } from './use-today-selection'
import type { TodayInitialHabits } from './today-initial-data'

export interface TodayView {
  activeView: ActiveView
  search: ReturnType<typeof useHabitViewSearch>
  changeView: (view: ActiveView) => void
  nav: TodayNavigation
  data: TodayHabitsData
  selection: ReturnType<typeof useTodaySelection>
  habitListRef: React.RefObject<HabitListHandle | null>
  setAllLoadedIds: (ids: Set<string>) => void
  habitListAllCollapsed: boolean
  setHabitListAllCollapsed: (value: boolean) => void
  showCompleted: boolean
  setShowCompleted: (value: boolean) => void
  isSelectMode: boolean
  selectedHabitIds: Set<string>
  toggleSelectMode: () => void
  setShowCreateModal: (value: boolean) => void
  showCreateModal: boolean
  setListSurfaceOpen: (value: boolean) => void
  listSurfaceOpen: boolean
}

export function useTodayPage(
  initialToday: string,
  initialHabits: TodayInitialHabits | null,
): TodayView {
  const router = useRouter()
  const activeView = useUIStore((state) => state.activeView)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const nav = useTodayNavigation(initialToday)
  useEffect(() => { if (nav.pinnedDateStr) setActiveView('today') }, [nav.pinnedDateStr, setActiveView])
  const accountGeneration = useAccountGeneration()
  const search = useHabitViewSearch(`${accountGeneration}:${activeView}:${activeView === 'today' ? nav.dateStr : ''}`)
  const closeSearch = search.close
  const clearSelection = useUIStore((state) => state.clearSelection)
  const changeView = useCallback((nextView: ActiveView) => {
    if (nextView !== 'today' && nav.pinnedDateStr) router.replace('/')
    clearSelection()
    closeSearch()
    setActiveView(nextView)
  }, [clearSelection, closeSearch, nav.pinnedDateStr, router, setActiveView])
  const data = useTodayHabitsData({
    activeView,
    searchQuery: search.query,
    dateStr: nav.dateStr,
    today: nav.today,
    isTodayDate: nav.isTodaySelected,
    initialHabits,
  })
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const selectedHabitIds = useUIStore((state) => state.selectedHabitIds)
  const toggleSelectMode = useUIStore((state) => state.toggleSelectMode)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const showCreateModal = useUIStore((state) => state.showCreateModal)
  const setTodayFabHidden = useUIStore((state) => state.setTodayFabHidden)
  const habitListRef = useRef<HabitListHandle>(null)
  const [allLoadedIds, setAllLoadedIds] = useState<Set<string> | null>(null)
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [listSurfaceOpen, setListSurfaceOpen] = useState(false)

  useEffect(() => {
    const hidden = isSelectMode || showCreateModal || listSurfaceOpen ||
      !data.hasFetched || data.showLoadError || data.habitsCount === 0
    setTodayFabHidden(hidden)
    return () => setTodayFabHidden(false)
  }, [
    data.hasFetched,
    data.habitsCount,
    data.showLoadError,
    isSelectMode,
    listSurfaceOpen,
    setTodayFabHidden,
    showCreateModal,
  ])

  useOverlayEscape({ open: isSelectMode, onDismiss: toggleSelectMode })

  const selection = useTodaySelection({
    selectedDateStr: activeView === 'today' ? nav.dateStr : nav.today,
    today: nav.today,
    habitsById: data.habitsById,
    childrenByParent: data.childrenByParent,
    habitsCount: data.habitsCount,
    allLoadedIds,
    habitListRef,
  })
  return {
    activeView,
    search,
    changeView,
    nav,
    data,
    selection,
    habitListRef,
    setAllLoadedIds,
    habitListAllCollapsed,
    setHabitListAllCollapsed,
    showCompleted,
    setShowCompleted,
    isSelectMode,
    selectedHabitIds,
    toggleSelectMode,
    setShowCreateModal,
    showCreateModal,
    setListSurfaceOpen,
    listSurfaceOpen,
  }
}
