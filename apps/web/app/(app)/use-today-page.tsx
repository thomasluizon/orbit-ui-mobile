'use client'

import { useMemo, useRef, useState } from 'react'
import { useReducedMotion, type Transition } from 'motion/react'
import { resolveMotionPreset } from '@orbit/shared/theme'
import type { ActiveView } from '@orbit/shared/stores'
import type { EngagementSlotCard } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useProfile } from '@/hooks/use-profile'
import { useEngagementSlot } from '@/hooks/use-engagement-slot'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useTags, type Tag } from '@/hooks/use-tags'
import { useCoachTour } from '@/hooks/use-coach-tour'
import { useTopbarSlot } from '@/components/shell/topbar-slot'
import type { HabitListHandle } from '@/components/habits/habit-list'
import { TodayDateNavigation, type TodayTabItem, type TodayTabView } from './today-shell'
import { useTodayViewSync } from './use-today-view-sync'
import {
  useTodayNavigation,
  type TodayNavigation,
  type TodayDateNavBundle,
} from './use-today-navigation'
import { useTodaySearch, type TodaySearch } from './use-today-search'
import { useTodayViewState } from './use-today-view-state'
import { useTodayHabitsData, type TodayHabitsData } from './use-today-habits-data'
import { useTodaySelection } from './use-today-selection'

export interface TodayView {
  nav: TodayNavigation
  search: TodaySearch
  data: TodayHabitsData
  selection: ReturnType<typeof useTodaySelection>
  currentActiveView: ActiveView
  hasProAccess: boolean
  tabItems: TodayTabItem[]
  attemptViewChange: (nextView: TodayTabView) => boolean
  viewsLabel: string
  streak: number
  tags: Tag[]
  searchQueryStore: string
  engagementSlot: EngagementSlotCard | null
  engagementExitTransition: Transition
  listTransition: Transition
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
  dismissHomeEntry: () => void
  showReferral: boolean
  setShowReferral: (value: boolean) => void
}

function useTodayTopbarNav(currentActiveView: ActiveView, dateNav: TodayDateNavBundle) {
  const desktopDateNav = useMemo(
    () =>
      currentActiveView === 'today' ? (
        <TodayDateNavigation compact visible {...dateNav} />
      ) : null,
    [currentActiveView, dateNav],
  )
  useTopbarSlot(desktopDateNav)
}

/**
 * Composes the Today screen's focused sub-hooks (navigation, search, view/tab
 * state, habit data, selection) into a single view model the page and its region
 * components render. Pure extraction of the former 572-line TodayPage.
 */
export function useTodayPage(): TodayView {
  const prefersReducedMotion = useReducedMotion()
  const { profile } = useProfile()
  const { tags } = useTags()
  useCoachTour()

  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const showCompleted = useUIStore((s) => s.showCompleted)
  const setShowCompleted = useUIStore((s) => s.setShowCompleted)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const dismissHomeEntry = useReferralPromptStore((s) => s.dismissHomeEntry)

  const viewState = useTodayViewState()
  const nav = useTodayNavigation()
  const search = useTodaySearch()

  const [showReferral, setShowReferral] = useState(false)
  const habitListRef = useRef<HabitListHandle>(null)
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)

  useOverlayEscape({ open: isSelectMode, onDismiss: toggleSelectMode })

  const data = useTodayHabitsData({
    currentActiveView: viewState.currentActiveView,
    dateStr: nav.dateStr,
    selectedDate: nav.selectedDate,
  })

  const selection = useTodaySelection({
    habitsById: data.habitsById,
    childrenByParent: data.childrenByParent,
    habitsCount: data.habitsCount,
    habitListRef,
  })

  const { slot: engagementSlot } = useEngagementSlot({
    isTodayView: viewState.currentActiveView === 'today',
    isTodayDate: nav.isTodaySelected,
  })

  useTodayViewSync({
    pinnedDateStr: nav.pinnedDateStr,
    searchQueryStore,
    activeView,
    isSelectMode,
    setActiveView,
    setLocalSearchQuery: search.setLocalSearchQuery,
    setSearchQuery,
    clearSelection,
  })

  const listMotionPreset = resolveMotionPreset('list-enter', Boolean(prefersReducedMotion))
  const listTransition = {
    duration: listMotionPreset.enterDuration / 1000,
    ease: listMotionPreset.enterEasing,
  } as const
  const engagementExitTransition = {
    duration: prefersReducedMotion ? 0 : 0.16,
    ease: [0.2, 0, 0, 1],
  } as const

  useTodayTopbarNav(viewState.currentActiveView, nav.dateNav)

  return {
    nav,
    search,
    data,
    selection,
    ...viewState,
    streak: profile?.currentStreak ?? 0,
    tags,
    searchQueryStore,
    engagementSlot,
    engagementExitTransition,
    listTransition,
    refetchShift: Math.round(listMotionPreset.shift / 2),
    habitListRef,
    habitListAllCollapsed,
    setHabitListAllCollapsed,
    isSelectMode,
    selectedHabitIds,
    toggleSelectMode,
    showCompleted,
    setShowCompleted,
    setShowCreateModal,
    dismissHomeEntry,
    showReferral,
    setShowReferral,
  }
}
