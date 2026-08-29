'use client'

import { useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
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
  listTransition: { duration: number; ease: readonly [number, number, number, number] }
  refetchShift: number
  habitListRef: React.RefObject<HabitListHandle | null>
  habitListAllCollapsed: boolean
  setHabitListAllCollapsed: (value: boolean) => void
  isSelectMode: boolean
  selectedHabitIds: Set<string>
  toggleSelectMode: () => void
  showCompleted: boolean
  setShowCompleted: (value: boolean) => void
  setShowCreateModal: (value: boolean) => void
}

export function useTodayPage(initialHabits: TodayInitialHabits | null = null): TodayView {
  const prefersReducedMotion = useReducedMotion()
  const nav = useTodayNavigation()
  const data = useTodayHabitsData({
    dateStr: nav.dateStr,
    selectedDate: nav.selectedDate,
    initialHabits,
  })
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const selectedHabitIds = useUIStore((state) => state.selectedHabitIds)
  const toggleSelectMode = useUIStore((state) => state.toggleSelectMode)
  const showCompleted = useUIStore((state) => state.showCompleted)
  const setShowCompleted = useUIStore((state) => state.setShowCompleted)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const habitListRef = useRef<HabitListHandle>(null)
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)

  useOverlayEscape({ open: isSelectMode, onDismiss: toggleSelectMode })

  const selection = useTodaySelection({
    selectedDateStr: nav.dateStr,
    habitsById: data.habitsById,
    childrenByParent: data.childrenByParent,
    habitsCount: data.habitsCount,
    habitListRef,
  })
  const preset = resolveMotionPreset('list-enter', Boolean(prefersReducedMotion))

  return {
    nav,
    data,
    selection,
    listTransition: {
      duration: preset.enterDuration / 1000,
      ease: preset.enterEasing,
    },
    refetchShift: Math.round(preset.shift / 2),
    habitListRef,
    habitListAllCollapsed,
    setHabitListAllCollapsed,
    isSelectMode,
    selectedHabitIds,
    toggleSelectMode,
    showCompleted,
    setShowCompleted,
    setShowCreateModal,
  }
}
