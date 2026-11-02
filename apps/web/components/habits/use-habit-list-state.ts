'use client'

import { useAppToast } from '@/hooks/use-app-toast'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import { habitViewQueryOptions } from '@orbit/shared/utils/habit-list-pagination-core'
import { useMemo, useCallback, useEffect, useId, useState, useRef, useImperativeHandle } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useOpenHabit } from '@/hooks/use-open-habit'
import { filterHabitViewRoots, collectVisibleHabitTreeIds, computeHabitDayProgress, formatAPIDate, isTodayLaunchCache } from '@orbit/shared/utils'
import type { HabitView } from './habit-list/tree-helpers'
import { EMPTY_CHILDREN_BY_PARENT, EMPTY_HABITS_BY_ID, EMPTY_NORMALIZED_HABITS, useHabits, useLogHabit, useBulkLogHabits, useBulkSkipHabits, useSkipHabit, useDeleteHabit, useDuplicateHabit, useReorderHabits } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useToday } from '@/app/(app)/today-provider'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { addRecentCompletion, getRecentlyCompletedIdsForDate, removeRecentCompletion } from '@orbit/shared/utils/drill-navigation'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { useDragAccessibility } from '@/components/ui/drag-accessibility'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { MoveParentIntent } from './habit-list/move-parent-controller'
import { useAccountGeneration, useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'
import { motionDurations } from '@orbit/shared/theme'
import type { HabitListProps, HabitListHandleInputs } from './habit-list'
import type { useParentPromptQueue } from './use-parent-prompt-queue'
import type { useHabitListConfirmations } from './use-habit-list-confirmations'

type HabitListQueriesInputs = { view: HabitView } & { requestedDate: HabitListProps['selectedDate'] } & Pick<HabitListProps, 'filters'>

export function useHabitListQueries({ view, requestedDate, filters }: HabitListQueriesInputs) {
  const selectedDate = view === 'today' ? requestedDate : undefined
  const accountGeneration = useAccountGeneration()
  const t = useTranslations()
  const { isOnline } = useOffline()
  const openHabit = useOpenHabit()
  const { profile } = useProfile()
  const todayStr = useToday(profile?.timeZone)
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const dndContextId = useId()

  const habitsQuery = useHabits(filters, undefined, habitViewQueryOptions(view, todayStr))
  const [launchCache] = useState({ available: habitsQuery.data !== undefined, updatedAt: habitsQuery.dataUpdatedAt })
  const launchFromCache = isTodayLaunchCache(launchCache, habitsQuery.dataUpdatedAt)
  const accountHabitCount = useHabitCountLoaded()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()
  const { showError } = useAppToast()
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const deleteHabitMut = useDeleteHabit()
  const duplicateHabitMut = useDuplicateHabit()
  const reorderHabitsMut = useReorderHabits()

  const data = habitsQuery.data
  const habitsById = data?.habitsById ?? EMPTY_HABITS_BY_ID
  const dragAccessibility = useDragAccessibility(t, (id) => habitsById.get(String(id))?.title, t('dragAndDrop.habitInstructions'))
  const childrenByParent = data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const topLevelHabits = data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS

  const getChildren = habitsQuery.getChildren

  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : todayStr
  return { selectedDateStr, habitsById, childrenByParent, habitsQuery, todayStr, topLevelHabits, getChildren, dndContextId, reorderHabitsMut, t, selectedDate, isOnline, accountGeneration, profile, skipHabit, logHabit, openHabit, duplicateHabitMut, deleteHabitMut, bulkLog, bulkSkip, showError, displayTime, locale, accountHabitCount, dragAccessibility, launchFromCache }
}

type HabitRecentCompletionStateInputs = Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr'>

export function useHabitRecentCompletionState({ selectedDateStr }: HabitRecentCompletionStateInputs) {
  const [recentlyCompletedDates, setRecentlyCompletedDates] = useAccountScopedState(
    () => new Map<string, Set<string>>(),
  )
  const recentlyCompletedIds = useMemo(
    () => getRecentlyCompletedIdsForDate(recentlyCompletedDates, selectedDateStr),
    [recentlyCompletedDates, selectedDateStr],
  )
  return { setRecentlyCompletedDates, recentlyCompletedIds, recentlyCompletedDates }
}

type HabitRecentCompletionsInputs = Pick<ReturnType<typeof useHabitListQueries>, 'selectedDateStr'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'setRecentlyCompletedDates'>

export function useHabitRecentCompletions({ selectedDateStr, setRecentlyCompletedDates }: HabitRecentCompletionsInputs) {
  const recentlyCompletedTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  )

  useEffect(() => {
    const timers = recentlyCompletedTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const markRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    setRecentlyCompletedDates((prev) => addRecentCompletion(prev, habitId, date))
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) clearTimeout(existing)
    timers.set(
      timerKey,
      setTimeout(() => {
        timers.delete(timerKey)
        setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
      }, motionDurations.micro),
    )
  }, [selectedDateStr, setRecentlyCompletedDates])

  const clearRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      timers.delete(timerKey)
    }
    setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
  }, [selectedDateStr, setRecentlyCompletedDates])
  return { recentlyCompletedTimersRef, markRecentlyCompleted, clearRecentlyCompleted }
}

type HabitListVisibilityInputs = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent' | 'selectedDateStr' | 'habitsQuery' | 'todayStr'> & { searchQuery: string } & { showCompleted: boolean } & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds' | 'recentlyCompletedDates'> & { view: HabitView }

export function useHabitListVisibility({ habitsById, childrenByParent, selectedDateStr, searchQuery, showCompleted, recentlyCompletedIds, view, habitsQuery, recentlyCompletedDates, todayStr }: HabitListVisibilityInputs) {
  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
  })

  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return visibility.getVisibleChildren(parentId, view)
    },
    [visibility, view],
  )

  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt, {
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
    recentlyCompletedDates,
  }, view, todayStr)
  return { visibility, getVisibleChildren, drill }
}

type HabitListCollapseInputs = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent'> & Pick<HabitListProps, 'onAllCollapsedChange'>

export function useHabitListCollapse({ habitsById, childrenByParent, onAllCollapsedChange }: HabitListCollapseInputs) {
  const [collapsedIds, setCollapsedIds] = useAccountScopedState(() => new Set<string>())

  const toggleExpand = useCallback((habitId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(habitId)) {
        next.delete(habitId)
      } else {
        next.add(habitId)
      }
      return next
    })
  }, [setCollapsedIds])

  const expandableIds = useMemo(() => {
    const ids: string[] = []
    for (const h of habitsById.values()) {
      const childIds = childrenByParent.get(h.id)
      if (childIds && childIds.length > 0) ids.push(h.id)
    }
    return ids
  }, [habitsById, childrenByParent])

  const allCollapsed = expandableIds.length > 0 && expandableIds.every((id) => collapsedIds.has(id))

  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- allCollapsed is derived from both collapsedIds (local) and expandableIds (data-driven); the parent toolbar must reflect it, and no single event handler covers the data-driven changes, so a notify-effect is the correct channel https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onAllCollapsedChange?.(allCollapsed)
  }, [allCollapsed, onAllCollapsedChange])

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(expandableIds))
  }, [expandableIds, setCollapsedIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [setCollapsedIds])
  return { collapsedIds, setCollapsedIds, toggleExpand, collapseAll, expandAll, allCollapsed }
}

type HabitListRootsInputs = Pick<ReturnType<typeof useHabitListQueries>, 'topLevelHabits'> & { view: HabitView } & { showCompleted: boolean } & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'> & Pick<ReturnType<typeof useHabitListVisibility>, 'visibility' | 'getVisibleChildren'> & Pick<HabitListProps, 'onAllLoadedIdsChange'>

export function useHabitListRoots({ topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility, getVisibleChildren, onAllLoadedIdsChange }: HabitListRootsInputs) {
  const habits = useMemo(() => {
    return filterHabitViewRoots(topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility)
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is destructured from the query data every render and already listed; the memo keys off the resolved array, not data.topLevelHabits https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(habits, getVisibleChildren)
  }, [getVisibleChildren, habits])

  useEffect(() => { onAllLoadedIdsChange?.(allLoadedIds) }, [allLoadedIds, onAllLoadedIdsChange])
  return { habits, allLoadedIds }
}

type HabitListProgressInputs = Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: HabitView } & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById'>

export function useHabitListProgress({ visibility, view, getChildren, habitsById }: HabitListProgressInputs) {
  const childrenProgressMap = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()

    function computeChildProgress(
      child: NormalizedHabit,
      computeFn: (id: string) => { done: number; total: number },
    ): { done: number; total: number } {
      const ownProgress = computeHabitDayProgress([child], visibility.isDueOnSelectedDate, view)
      const nested = computeFn(child.id)
      return { done: ownProgress.done + nested.done, total: ownProgress.total + nested.total }
    }

    function compute(habitId: string): { done: number; total: number } {
      const cached = map.get(habitId)
      if (cached) return cached

      const children = getChildren(habitId)
      if (children.length === 0) {
        const result = { done: 0, total: 0 }
        map.set(habitId, result)
        return result
      }

      let done = 0
      let total = 0
      for (const child of children) {
        const progress = computeChildProgress(child, compute)
        done += progress.done
        total += progress.total
      }

      const result = { done, total }
      map.set(habitId, result)
      return result
    }

    for (const habit of habitsById.values()) {
      if (!map.has(habit.id)) {
        compute(habit.id)
      }
    }

    return map
    // react-doctor-disable-next-line exhaustive-deps -- getChildren is aliased from habitsQuery.getChildren every render and already listed; the memo keys off the resolved function, not habitsQuery.getChildren https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [habitsById, getChildren, visibility, view])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )
  return { getChildrenProgress }
}

type HabitListModalStateInputs = { view: HabitView } & Pick<ReturnType<typeof useHabitListQueries>, 'selectedDate' | 'isOnline'>

export function useHabitListModalState({ view, selectedDate, isOnline }: HabitListModalStateInputs) {
  const cardSelectedDate = view === 'today' ? selectedDate : undefined

  const [showEditModal, setShowEditModal] = useAccountScopedState(false)
  const [habitToEdit, setHabitToEdit] = useAccountScopedState<NormalizedHabit | null>(null)
  const [editModalOnSaved, setEditModalOnSaved] = useAccountScopedState<(() => void | Promise<void>) | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useAccountScopedState(false)
  const [refusedSubHabitParentId, setRefusedSubHabitParentId] = useAccountScopedState<string | null>(null)
  useEffect(() => { if (isOnline) setRefusedSubHabitParentId(null) }, [isOnline, setRefusedSubHabitParentId])
  const [subHabitParent, setSubHabitParent] = useAccountScopedState<NormalizedHabit | null>(null)
  const [showRescheduleSheet, setShowRescheduleSheet] = useAccountScopedState(false)
  const [habitToReschedule, setHabitToReschedule] = useAccountScopedState<NormalizedHabit | null>(null)
  return { showEditModal, showSubHabitModal, showRescheduleSheet, habitToEdit, setShowEditModal, setHabitToEdit, setEditModalOnSaved, setRefusedSubHabitParentId, setSubHabitParent, setShowSubHabitModal, cardSelectedDate, setHabitToReschedule, setShowRescheduleSheet, refusedSubHabitParentId, editModalOnSaved, habitToReschedule, subHabitParent }
}

type HabitListMoveStateInputs = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'accountGeneration'> & Pick<HabitListProps, 'selectedHabitIds' | 'onBulkMove'>

export function useHabitListMoveState({ habitsById, accountGeneration, selectedHabitIds, onBulkMove }: HabitListMoveStateInputs) {
  const [moveIntent, setMoveIntent] = useAccountScopedState<MoveParentIntent | null>(null)
  const moveSequence = useRef(0)
  function openMoveParentPicker(habitId: string) {
    if (!habitsById.has(habitId)) return
    setMoveIntent({ key: ++moveSequence.current, accountGeneration, habitId, bulkIds: null, sourceHabits: new Map(habitsById) })
  }
  function openBulkMove() {
    const bulkIds = Array.from(selectedHabitIds ?? [])
    if (bulkIds.length === 0 || bulkIds.length > MAX_BULK_OPERATION_SIZE || !onBulkMove) return
    setMoveIntent({ key: ++moveSequence.current, accountGeneration, habitId: null, bulkIds, sourceHabits: new Map(habitsById) })
  }
  const closeMoveParentPicker = () => setMoveIntent((current) => current === moveIntent ? null : current)
  return { moveIntent, openBulkMove, openMoveParentPicker, closeMoveParentPicker }
}

type HabitListSurfaceStateInputs = Pick<ReturnType<typeof useHabitRecentCompletions>, 'recentlyCompletedTimersRef'> & Pick<ReturnType<typeof useParentPromptQueue>, 'parentPrompt'> & { confirmations: ReturnType<typeof useHabitListConfirmations> } & Pick<ReturnType<typeof useHabitListVisibility>, 'drill'> & Pick<ReturnType<typeof useHabitListModalState>, 'showEditModal' | 'showSubHabitModal' | 'showRescheduleSheet'> & Pick<ReturnType<typeof useHabitListMoveState>, 'moveIntent'> & Pick<HabitListProps, 'onSurfaceOpenChange'>

export function useHabitListSurfaceState({ recentlyCompletedTimersRef, confirmations, drill, showEditModal, showSubHabitModal, showRescheduleSheet, parentPrompt, moveIntent, onSurfaceOpenChange }: HabitListSurfaceStateInputs) {
  useResetOnAccountChange(() => {
    for (const timer of recentlyCompletedTimersRef.current.values()) clearTimeout(timer)
    recentlyCompletedTimersRef.current.clear()
  })
  const { showDeleteConfirm, deletePending, habitToDuplicate } = confirmations

  const surfaceOpen = Boolean(
    drill.currentParent ||
    showEditModal ||
    showSubHabitModal ||
    showRescheduleSheet ||
    showDeleteConfirm ||
    deletePending ||
    habitToDuplicate ||
    parentPrompt ||
    moveIntent,
  )
  useEffect(() => {
    onSurfaceOpenChange?.(surfaceOpen)
  }, [onSurfaceOpenChange, surfaceOpen])

}

type HabitListEditStateInputs = Pick<ReturnType<typeof useHabitListModalState>, 'habitToEdit' | 'setShowEditModal' | 'setHabitToEdit' | 'setEditModalOnSaved'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'openHabit' | 'selectedDateStr'>

export function useHabitListEditState({ habitToEdit, habitsById, openHabit, selectedDateStr, setShowEditModal, setHabitToEdit, setEditModalOnSaved }: HabitListEditStateInputs) {
  const editHabitLockedGeneral = ((): boolean | null => {
    if (!habitToEdit) return null
    if (habitToEdit.parentId) {
      return habitsById.get(habitToEdit.parentId)?.isGeneral ?? null
    }
    for (const candidate of habitsById.values()) {
      if (candidate.parentId === habitToEdit.id) return candidate.isGeneral
    }
    return null
  })()

  function openDetail(habit: NormalizedHabit) {
    openHabit(habit.id, selectedDateStr, true)
  }

  const handleEditModalOpenChange = useCallback((open: boolean) => {
    setShowEditModal(open)
    if (!open) {
      setHabitToEdit(null)
      setEditModalOnSaved(null)
    }
  }, [setEditModalOnSaved, setHabitToEdit, setShowEditModal])
  return { openDetail, handleEditModalOpenChange, editHabitLockedGeneral }
}

export function useHabitListHandle({ ref, collapseAll, expandAll, allCollapsed, allLoadedIds, markRecentlyCompleted, checkAndPromptParentLog, settleBulkHabitResolutions, openBulkMove, listContainerRef }: HabitListHandleInputs) {
  useImperativeHandle(ref, () => ({
    collapseAll,
    expandAll,
    get allCollapsed() { return allCollapsed },
    get allLoadedIds() { return allLoadedIds },
    markRecentlyCompleted,
    checkAndPromptParentLog,
    settleBulkHabitResolutions,
    openBulkMove,
  }))

  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const handleHomeEndFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Home' && event.key !== 'End') return

      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(':scope [data-habit-row-body]'),
      ).filter((row) => !row.closest('[inert]'))
      const activeElement = document.activeElement
      if (!(activeElement instanceof HTMLElement) || !rows.includes(activeElement)) return

      const target = event.key === 'Home' ? rows[0] : rows.at(-1)
      if (!target) return
      event.preventDefault()
      target.focus()
    }

    container.addEventListener('keydown', handleHomeEndFocus)
    return () => container.removeEventListener('keydown', handleHomeEndFocus)
  }, [listContainerRef])

}
