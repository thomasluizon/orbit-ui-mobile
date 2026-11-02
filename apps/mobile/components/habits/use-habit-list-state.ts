import { useAppToast } from '@/hooks/use-app-toast'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { useListScrollReservation } from '@/hooks/use-list-scroll-reservation'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createListCellMotion } from '@/lib/list-motion'
import { getFriendlyErrorMessage, isTodayLaunchCache , getHabitInlineDepthLimit, buildHabitDateBuckets, filterHabitViewRoots, formatHabitDateBucketLabel, computeHabitDayProgress, collectSelectableDescendantIds, collectVisibleHabitTreeIds, formatAPIDate, formatAPIDateInTimeZone, getTodayBoundary } from '@orbit/shared/utils'
import { getMoveParentInventory } from '@orbit/shared/utils/move-parent'
import { createMoveParentActions, createMoveParentState } from '@orbit/shared/hooks/move-parent-core'
import { useAccountGeneration, useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { motionDurations, PADDING, SPACING } from '@orbit/shared/theme'
import { habitViewQueryOptions } from '@orbit/shared/utils/habit-list-pagination-core'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWindowDimensions, type FlatList, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import type { FlatList as GHFlatList } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useShellListFocus } from '@/components/shell/shell-focus-target'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { EMPTY_HABITS_BY_ID, EMPTY_NORMALIZED_HABITS, useHabits, useLogHabit, useBulkLogHabits, useBulkSkipHabits, useSkipHabit, useDeleteHabit, useDuplicateHabit, useReorderHabits, useMoveHabitParent } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useCurrentDate } from '@/app/(tabs)/use-today-date'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { addRecentCompletion, getRecentlyCompletedIdsForDate, removeRecentCompletion } from '@orbit/shared/utils/drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { buildFlatHabitItems, getMoveParentSelection, validateMoveTarget as computeMoveTargetValidation, type DragItem } from '../habit-list/tree-helpers'
import { createStyles } from '../habit-list/styles'
import type { HabitListProps, HabitListHandleInputs } from '../habit-list'
import type { useHabitListDrag } from './use-habit-list-drag'

type HabitListAccountInputs = { view: NonNullable<HabitListProps['view']> } & { requestedDate: HabitListProps['selectedDate'] }

export function useHabitListAccount({ view, requestedDate }: HabitListAccountInputs) {
  const selectedDate = view === 'today' ? requestedDate : undefined
  const accountGeneration = useAccountGeneration()
  const { t, i18n } = useTranslation()
  const accountHabitCount = useHabitCountLoaded()
  const { profile } = useProfile()
  const accountTimeZone = profile?.timeZone
  const todayStr = useCurrentDate(accountTimeZone)
  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : todayStr
  const rowDate = useMemo(() => new Date(`${selectedDateStr}T00:00:00`), [selectedDateStr])
  const settlementDateIsReadOnly = useCallback((date: string): boolean =>
    !profile || getTodayBoundary(date, formatAPIDateInTimeZone(new Date(), profile.timeZone)) === 'read-only',
    [profile])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  return { accountGeneration, selectedDateStr, todayStr, i18n, t, settlementDateIsReadOnly, profile, accountTimeZone, selectedDate, rowDate, styles, tokens, accountHabitCount }
}

type HabitListScrollInputs = Pick<ReturnType<typeof useHabitListAccount>, 'accountGeneration' | 'selectedDateStr'> & { view: NonNullable<HabitListProps['view']> } & Pick<HabitListProps, 'isSelectMode' | 'onScroll'>

export function useHabitListScroll({ accountGeneration, view, selectedDateStr, isSelectMode, onScroll }: HabitListScrollInputs) {
  const clearance = useShellScrollerClearance()
  const { minimumHeight, onLayout: reserveViewport, onOffset: reserveOffset } = useListScrollReservation(`${accountGeneration}:${view}:${selectedDateStr}`)
  const bulkBarStyle = { minHeight: minimumHeight, paddingBottom: clearance + (isSelectMode ? SPACING.s24 : SPACING.s0) }
  const scrollContainerRef = useRef<GHFlatList<DragItem>>(null)
  const drillListRef = useRef<FlatList<NormalizedHabit>>(null)
  const stateListRef = useRef<FlatList<string>>(null)
  const allListRef = useRef<FlatList<DragItem>>(null)
  const listScrollOffsets = useRef(new WeakMap<object, number>())
  const revealListFocus = useShellListFocus((delta) => {
    const target = scrollContainerRef.current ?? allListRef.current ?? drillListRef.current ?? stateListRef.current
    if (!target) return
    const offset = Math.max(0, (listScrollOffsets.current.get(target) ?? 0) + delta)
    listScrollOffsets.current.set(target, offset)
    target.scrollToOffset({ offset, animated: false })
  })
  const handleListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const target = allListRef.current ?? drillListRef.current ?? stateListRef.current
      if (target) listScrollOffsets.current.set(target, e.nativeEvent.contentOffset.y)
      reserveOffset(e.nativeEvent.contentOffset.y)
      onScroll?.(e.nativeEvent.contentOffset.y)
    },
    [onScroll, reserveOffset],
  )
  const handleMainListOffsetChange = useCallback(
    (offsetY: number) => {
      if (scrollContainerRef.current) listScrollOffsets.current.set(scrollContainerRef.current, offsetY)
      reserveOffset(offsetY)
      onScroll?.(offsetY)
    },
    [onScroll, reserveOffset],
  )
  return { reserveViewport, scrollContainerRef, allListRef, drillListRef, stateListRef, handleListScroll, revealListFocus, bulkBarStyle, handleMainListOffsetChange }
}

type HabitListQueriesInputs = Pick<HabitListProps, 'filters'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListAccount>, 'todayStr'>

export function useHabitListQueries({ filters, view, todayStr }: HabitListQueriesInputs) {
  const { config: appConfig } = useConfig()
  const maxHabitDepth = appConfig.limits.maxHabitDepth
  const habitsQuery = useHabits(filters, habitViewQueryOptions(view, todayStr))
  const [launchCache] = useState({ available: habitsQuery.data !== undefined, updatedAt: habitsQuery.dataUpdatedAt })
  const launchFromCache = isTodayLaunchCache(launchCache, habitsQuery.dataUpdatedAt)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const topLevelHabits =
    habitsQuery.data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS

  const isLoading = habitsQuery.isLoading
  const isError = habitsQuery.isError
  const isFetching = habitsQuery.isFetching
  const refetch = habitsQuery.refetch
  const getChildren = habitsQuery.getChildren
  const childrenByParent = useMemo(
    () =>
      habitsQuery.data?.childrenByParent ?? new Map<string, string[]>(),
    [habitsQuery.data?.childrenByParent],
  )

  const bulkLog = useBulkLogHabits({ suppressParentSettlement: true })
  const bulkSkip = useBulkSkipHabits({ suppressParentSettlement: true })
  const { showError } = useAppToast()
  const logMutation = useLogHabit()
  const logMutateAsync = logMutation.mutateAsync
  const skipMutation = useSkipHabit()
  const deleteMutation = useDeleteHabit()
  const duplicateMutation = useDuplicateHabit()
  const reorderHabitsMutation = useReorderHabits()
  const moveParentMutation = useMoveHabitParent()
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)
  return { habitsById, habitsQuery, childrenByParent, topLevelHabits, getChildren, skipMutation, logMutateAsync, bulkLog, bulkSkip, showError, refetch, maxHabitDepth, moveParentMutation, duplicateMutation, deleteMutation, reorderHabitsMutation, toggleSelectMode, toggleSelectionCascade, launchFromCache, isFetching, isLoading, isError }
}

export function useHabitListCollapseState() {
  const reducedListMotion = usePrefersReducedMotion()
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
  return { collapsedIds, setCollapsedIds, reducedListMotion }
}

type HabitRecentCompletionStateInputs = Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'>

export function useHabitRecentCompletionState({ selectedDateStr }: HabitRecentCompletionStateInputs) {
  const [recentlyCompletedDates, setRecentlyCompletedDates] = useState(
    new Map<string, Set<string>>(),
  )
  const recentlyCompletedIds = useMemo(
    () => getRecentlyCompletedIdsForDate(recentlyCompletedDates, selectedDateStr),
    [recentlyCompletedDates, selectedDateStr],
  )
  return { recentlyCompletedIds, recentlyCompletedDates, setRecentlyCompletedDates }
}

type HabitListDrillInputs = Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'habitsQuery' | 'childrenByParent'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr' | 'todayStr'> & Pick<HabitListProps, 'searchQuery' | 'showCompleted' | 'onSurfaceOpenChange'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds' | 'recentlyCompletedDates'> & { view: NonNullable<HabitListProps['view']> }

export function useHabitListDrill({ habitsById, habitsQuery, childrenByParent, selectedDateStr, searchQuery, showCompleted, recentlyCompletedIds, recentlyCompletedDates, view, todayStr, onSurfaceOpenChange }: HabitListDrillInputs) {
  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt, {
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery: searchQuery ?? '',
    showCompleted,
    recentlyCompletedIds,
    recentlyCompletedDates,
  }, view, todayStr)

  useEffect(() => {
    onSurfaceOpenChange?.(drill.currentParentId !== null)
  }, [drill.currentParentId, onSurfaceOpenChange])
  return { drill }
}

export function useHabitListModalState() {
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] =
    useState<NormalizedHabit | null>(null)
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false)
  const [habitToReschedule, setHabitToReschedule] =
    useState<NormalizedHabit | null>(null)
  return { setSubHabitParent, setShowSubHabitModal, setHabitToReschedule, setShowRescheduleSheet, showSubHabitModal, subHabitParent, showRescheduleSheet, habitToReschedule }
}

export function useHabitListMoveState() {
  const [moveState, setMoveState] = useAccountScopedState(createMoveParentState)
  const { bulkIds: bulkMovingIds, habitId: movingHabitId, selectedParentId: selectedMoveParentId,
    error: moveError, pending: isMovingParent, open: showMoveParentDialog } = moveState
  const scheduledMoveQuery = useHabits({}, { enabled: showMoveParentDialog })
  const generalMoveQuery = useHabits({ isGeneral: true }, { enabled: showMoveParentDialog })
  const moveInventory = getMoveParentInventory(scheduledMoveQuery, generalMoveQuery)
  const retryMoveInventory = () => { void scheduledMoveQuery.refetch(); void generalMoveQuery.refetch() }
  const moveOperation = useRef<object | null>(null)
  useLayoutEffect(() => {
    moveOperation.current = moveState.operation
    return () => { moveOperation.current = null }
  }, [moveState.operation])
  return { movingHabitId, moveInventory, bulkMovingIds, selectedMoveParentId, moveState, isMovingParent, setMoveState, moveOperation, showMoveParentDialog, moveError, retryMoveInventory }
}

type HabitListSelectionStateInputs = Pick<HabitListProps, 'selectedHabitIds' | 'isSelectMode'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'>

export function useHabitListSelectionState({ selectedHabitIds, isSelectMode, recentlyCompletedIds }: HabitListSelectionStateInputs) {
  const selectedIds = useMemo(
    () => selectedHabitIds ?? new Set<string>(),
    [selectedHabitIds],
  )
  const listExtraData = useMemo(
    () =>
      getHabitListExtraData(
        Boolean(isSelectMode),
        selectedIds,
        recentlyCompletedIds,
      ),
    [isSelectMode, recentlyCompletedIds, selectedIds],
  )
  return { selectedIds, listExtraData }
}

type HabitListVisibilityInputs = Pick<ReturnType<typeof useHabitListMoveState>, 'movingHabitId'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & Pick<HabitListProps, 'searchQuery' | 'showCompleted'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'>

export function useHabitListVisibility({ movingHabitId, habitsById, childrenByParent, selectedDateStr, searchQuery, showCompleted, recentlyCompletedIds }: HabitListVisibilityInputs) {
  const movingHabit = movingHabitId
    ? (habitsById.get(movingHabitId) ?? null)
    : null

  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery: searchQuery ?? '',
    showCompleted,
    recentlyCompletedIds,
  })
  return { visibility, movingHabit }
}

type HabitRecentCompletionsInputs = Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'setRecentlyCompletedDates'>

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
    setRecentlyCompletedDates((previous) => addRecentCompletion(previous, habitId, date))
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) clearTimeout(existing)
    timers.set(
      timerKey,
      setTimeout(() => {
        timers.delete(timerKey)
        setRecentlyCompletedDates((previous) => removeRecentCompletion(previous, habitId, date))
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
    setRecentlyCompletedDates((previous) => removeRecentCompletion(previous, habitId, date))
  }, [selectedDateStr, setRecentlyCompletedDates])
  return { markRecentlyCompleted, clearRecentlyCompleted }
}

type HabitListRootsInputs = Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListQueries>, 'topLevelHabits' | 'childrenByParent'> & Pick<HabitListProps, 'showCompleted'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'>

export function useHabitListRoots({ visibility, view, topLevelHabits, showCompleted, recentlyCompletedIds, childrenByParent }: HabitListRootsInputs) {
  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] =>
      visibility.getVisibleChildren(parentId, view),
    [view, visibility],
  )

  const visibleHabits = useMemo(() => {
    return filterHabitViewRoots(topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility)
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is the extracted habitsQuery.data.topLevelHabits and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(visibleHabits, getVisibleChildren)
  }, [getVisibleChildren, visibleHabits])

  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      return collectSelectableDescendantIds(
        parentId,
        (habitId) => childrenByParent.get(habitId) ?? [],
        allLoadedIds,
      )
    },
    [allLoadedIds, childrenByParent],
  )
  return { getVisibleChildren, visibleHabits, allLoadedIds, getDescendantIds }
}

type HabitListCollapseInputs = Pick<ReturnType<typeof useHabitListRoots>, 'getVisibleChildren' | 'visibleHabits' | 'allLoadedIds'> & Pick<ReturnType<typeof useHabitListCollapseState>, 'collapsedIds' | 'setCollapsedIds'> & Pick<HabitListProps, 'onAllCollapsedChange' | 'onAllLoadedIdsChange'>

export function useHabitListCollapse({ getVisibleChildren, visibleHabits, collapsedIds, onAllCollapsedChange, onAllLoadedIdsChange, allLoadedIds, setCollapsedIds }: HabitListCollapseInputs) {
  const expandableIds = useMemo(() => {
    const ids: string[] = []

    const visit = (habit: NormalizedHabit) => {
      const children = getVisibleChildren(habit.id)
      if (children.length > 0) {
        ids.push(habit.id)
        for (const child of children) {
          visit(child)
        }
      }
    }

    for (const habit of visibleHabits) {
      visit(habit)
    }

    return ids
  }, [getVisibleChildren, visibleHabits])

  const allCollapsed = useMemo(
    () =>
      expandableIds.length > 0 &&
      expandableIds.every((id) => collapsedIds.has(id)),
    [collapsedIds, expandableIds],
  )

  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- documented parent-mirror callback: HabitList computes allCollapsed internally and notifies the parent so it can mirror it in render-time state (refs cannot be read during render, see the prop JSDoc) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onAllCollapsedChange?.(allCollapsed)
  }, [allCollapsed, onAllCollapsedChange])

  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- documented parent-mirror callback: HabitList computes allLoadedIds internally and notifies the parent so it can mirror it in render-time state (refs cannot be read during render, see the prop JSDoc) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onAllLoadedIdsChange?.(allLoadedIds)
  }, [allLoadedIds, onAllLoadedIdsChange])

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(expandableIds))
  }, [expandableIds, setCollapsedIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [setCollapsedIds])

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
  return { toggleExpand, allCollapsed, collapseAll, expandAll }
}

type HabitListItemsInputs = { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListRoots>, 'visibleHabits' | 'getVisibleChildren'> & Pick<ReturnType<typeof useHabitListAccount>, 'todayStr' | 'i18n' | 't' | 'accountGeneration' | 'selectedDateStr'> & Pick<ReturnType<typeof useHabitListScroll>, 'reserveViewport'> & Pick<ReturnType<typeof useHabitListCollapseState>, 'collapsedIds'> & Pick<HabitListProps, 'searchQuery' | 'filters' | 'isSelectMode'>

export function useHabitListItems({ view, visibleHabits, todayStr, i18n, t, reserveViewport, collapsedIds, getVisibleChildren, isSelectMode }: HabitListItemsInputs) {
  const dateGroups = useMemo(() => view === 'all' ? buildHabitDateBuckets(visibleHabits, todayStr) : [], [view, visibleHabits, todayStr])
  const groupHeadings = useMemo(() => new Map(dateGroups.map((bucket) => [bucket.habits[0]!.id, formatHabitDateBucketLabel(bucket.key, todayStr, i18n.language, t)])), [dateGroups, todayStr, i18n.language, t])
  const { width: windowWidth, fontScale } = useWindowDimensions()
  const [contentWidth, setContentWidth] = useState<number>()
  const measureList = useCallback((event: LayoutChangeEvent) => {
    setContentWidth(event.nativeEvent.layout.width - 2 * PADDING.screenGutter)
    reserveViewport(event)
  }, [reserveViewport])
  const maxInlineDepth = getHabitInlineDepthLimit(windowWidth, fontScale, contentWidth)
  const flatItems = useMemo<DragItem[]>(
    () => buildFlatHabitItems(view === 'all' ? dateGroups.flatMap((bucket) => bucket.habits) : visibleHabits, collapsedIds, getVisibleChildren, maxInlineDepth),
    [view, dateGroups, visibleHabits, collapsedIds, getVisibleChildren, maxInlineDepth],
  )

  const isDndEnabled = view !== 'all' && !isSelectMode
  return { maxInlineDepth, isDndEnabled, measureList, groupHeadings, flatItems }
}

type HabitListPresentationInputs = {
  drag: Pick<ReturnType<typeof useHabitListDrag>, 'activeDragItems' | 'isDraggingList'>
  account: Pick<ReturnType<typeof useHabitListAccount>, 'accountGeneration' | 'selectedDateStr'>
  reducedListMotion: ReturnType<typeof useHabitListCollapseState>['reducedListMotion']
} & Pick<HabitListProps, 'view' | 'searchQuery' | 'filters'>

export function useHabitListPresentation({ drag, account, view, searchQuery, filters, reducedListMotion }: HabitListPresentationInputs) {
  const { activeDragItems, isDraggingList } = drag
  const { accountGeneration, selectedDateStr } = account
  const presentation = useRetainedHabitList(activeDragItems, `${accountGeneration}:${view}:${isDraggingList}:${selectedDateStr}:${searchQuery ?? ''}:${JSON.stringify(filters)}`, reducedListMotion)
  const cellMotion = useMemo(() => createListCellMotion(reducedListMotion), [reducedListMotion])
  return { presentation, cellMotion }
}

type HabitListProgressInputs = Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById'>

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
      if (cached) {
        return cached
      }

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
    // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById are the extracted habitsQuery members and already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [getChildren, habitsById, visibility, view])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )
  return { getChildrenProgress }
}

type HabitMoveParentSelectionInputs = Pick<ReturnType<typeof useHabitListMoveState>, 'moveInventory' | 'bulkMovingIds' | 'movingHabitId' | 'selectedMoveParentId' | 'moveState' | 'isMovingParent'> & Pick<ReturnType<typeof useHabitListQueries>, 'maxHabitDepth' | 'moveParentMutation'> & Pick<ReturnType<typeof useHabitListAccount>, 't'>

export function useHabitMoveParentSelection({ moveInventory, maxHabitDepth, t, bulkMovingIds, movingHabitId, selectedMoveParentId, moveState, isMovingParent, moveParentMutation }: HabitMoveParentSelectionInputs) {
  const { moveIds, sharedMoveParentId, moveParentOptions, selectedMoveOption, inventoryState } = getMoveParentSelection(
    {
      ...moveInventory, maxHabitDepth, t, validateMoveTarget: (target, source) =>
        computeMoveTargetValidation({ ...moveInventory, maxHabitDepth, t }, target, source)
    },
    bulkMovingIds ?? movingHabitId, selectedMoveParentId, moveState.targetChosen,
  )

  const canSubmitMoveParent = !inventoryState && moveState.targetChosen && moveIds.length > 0 && !isMovingParent &&
    !moveParentMutation.isPending && selectedMoveOption !== null && !selectedMoveOption.disabled
  return { canSubmitMoveParent, sharedMoveParentId, inventoryState, moveParentOptions }
}

type HabitListMoveActionsInputs = Pick<ReturnType<typeof useHabitListMoveState>, 'moveState' | 'setMoveState' | 'moveOperation'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'moveParentMutation'> & Pick<HabitListProps, 'selectedHabitIds' | 'onBulkMove'> & Pick<ReturnType<typeof useHabitMoveParentSelection>, 'canSubmitMoveParent'> & Pick<ReturnType<typeof useHabitListAccount>, 't'>

export function useHabitListMoveActions({ moveState, setMoveState, habitsById, selectedHabitIds, canSubmitMoveParent, onBulkMove, moveParentMutation, t, moveOperation }: HabitListMoveActionsInputs) {
  const { openBulk: openBulkMove, openSingle: openMoveParentDialog, close: closeMoveParentDialog,
    confirm: executeMoveParent, select: selectMoveParent } = createMoveParentActions({
      state: moveState, applyState: setMoveState, habitsById, selectedHabitIds, canSubmit: canSubmitMoveParent, getAccountGeneration,
      moveBulk: onBulkMove,
      moveSingle: (habitId, parentId) => moveParentMutation.mutateAsync({ habitId, data: { parentId } }),
      partialError: t('habits.moveParent.errorPartial'),
      formatError: (error) => getFriendlyErrorMessage(error, t, 'habits.moveParent.errorPartial'),
    })
  const confirmMoveParent = () => executeMoveParent(() => moveOperation.current === moveState.operation)
  return { openBulkMove, openMoveParentDialog, closeMoveParentDialog, confirmMoveParent, selectMoveParent }
}

type HabitListSubHabitActionsInputs = Pick<ReturnType<typeof useHabitListCollapseState>, 'collapsedIds'> & Pick<ReturnType<typeof useHabitListCollapse>, 'toggleExpand'> & Pick<ReturnType<typeof useHabitListModalState>, 'setSubHabitParent' | 'setShowSubHabitModal'>

export function useHabitListSubHabitActions({ collapsedIds, toggleExpand, setSubHabitParent, setShowSubHabitModal }: HabitListSubHabitActionsInputs) {
  const startAddSubHabit = useCallback(
    (parentHabitCandidate: NormalizedHabit) => {
      const parentId = parentHabitCandidate.id

      if (collapsedIds.has(parentId)) {
        toggleExpand(parentId)
      }

      setSubHabitParent(parentHabitCandidate)
      setShowSubHabitModal(true)
    },
    [collapsedIds, setShowSubHabitModal, setSubHabitParent, toggleExpand],
  )
  return { startAddSubHabit }
}

export function useHabitListHandle({ ref, allCollapsed, allLoadedIds, collapseAll, expandAll, markRecentlyCompleted, checkAndPromptParentLog, settleBulkHabitResolutions, openBulkMove, refetch, scrollContainerRef, allListRef, drillListRef, stateListRef }: HabitListHandleInputs) {
  useImperativeHandle(
    ref,
    () => ({
      allCollapsed,
      allLoadedIds,
      collapseAll,
      expandAll,
      markRecentlyCompleted,
      checkAndPromptParentLog,
      settleBulkHabitResolutions,
      openBulkMove,
      refetch: () => {
        void refetch()
      },
      scrollToOffset: (offset: number, animated = true) => {
        const target = scrollContainerRef.current ?? allListRef.current ?? drillListRef.current ?? stateListRef.current
        target?.scrollToOffset({ offset, animated })
      },
    }),
    // react-doctor-disable-next-line exhaustive-deps -- refetch is the extracted habitsQuery.refetch and already listed; the analyzer wants the qualified path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [allCollapsed, allLoadedIds, collapseAll, expandAll, markRecentlyCompleted, checkAndPromptParentLog, settleBulkHabitResolutions, openBulkMove, refetch, scrollContainerRef, allListRef, drillListRef, stateListRef],
  )

}
