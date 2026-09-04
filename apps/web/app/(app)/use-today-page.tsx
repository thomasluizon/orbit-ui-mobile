'use client'

import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/stores/ui-store'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useTodayNavigation, type TodayNavigation } from './use-today-navigation'
import { useTodayHabitsData, type TodayHabitsData } from './use-today-habits-data'
import { useTodaySelection } from './use-today-selection'
import type { TodayInitialHabits } from './today-initial-data'

export interface TodayView {
  nav: TodayNavigation
  data: TodayHabitsData
  selection: ReturnType<typeof useTodaySelection>
  habitListRef: React.RefObject<HabitListHandle | null>
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
  const nav = useTodayNavigation(initialToday)
  const data = useTodayHabitsData({
    dateStr: nav.dateStr,
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
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [listSurfaceOpen, setListSurfaceOpen] = useState(false)

  useEffect(() => {
    const hidden = isSelectMode || showCreateModal || listSurfaceOpen ||
      data.isFetching || data.showLoadError || (data.hasFetched && data.habitsCount === 0)
    setTodayFabHidden(hidden)
    return () => setTodayFabHidden(false)
  }, [
    data.hasFetched,
    data.habitsCount,
    data.isFetching,
    data.showLoadError,
    isSelectMode,
    listSurfaceOpen,
    setTodayFabHidden,
    showCreateModal,
  ])

  useOverlayEscape({ open: isSelectMode, onDismiss: toggleSelectMode })

  const selection = useTodaySelection({
    selectedDateStr: nav.dateStr,
    today: nav.today,
    habitsById: data.habitsById,
    childrenByParent: data.childrenByParent,
    habitsCount: data.habitsCount,
    habitListRef,
  })
  return {
    nav,
    data,
    selection,
    habitListRef,
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
