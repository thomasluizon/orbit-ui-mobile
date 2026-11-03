import { computeHabitChildrenProgress,createUseHabitRecentCompletions } from '@orbit/shared/hooks'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { useListScrollReservation } from '@/hooks/use-list-scroll-reservation'
import { usePrefersReducedMotion } from '@/lib/motion'
import { createListCellMotion } from '@/lib/list-motion'
import { getFriendlyErrorMessage,isTodayLaunchCache,getHabitInlineDepthLimit,buildHabitDateBuckets,filterHabitViewRoots,formatHabitDateBucketLabel,collectSelectableDescendantIds,collectVisibleHabitTreeIds,formatAPIDate,formatAPIDateInTimeZone,getTodayBoundary } from '@orbit/shared/utils'
import { getMoveParentInventory } from '@orbit/shared/utils/move-parent'
import { createMoveParentActions,createMoveParentState } from '@orbit/shared/hooks/move-parent-core'
import { useAccountGeneration,useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { motionDurations,PADDING,SPACING } from '@orbit/shared/theme'
import { habitViewQueryOptions } from '@orbit/shared/utils/habit-list-pagination-core'
import { useCallback,useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState } from 'react'
import { useWindowDimensions,type FlatList,type LayoutChangeEvent,type NativeScrollEvent,type NativeSyntheticEvent } from 'react-native'
import type { FlatList as GHFlatList } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useShellListFocus } from '@/components/shell/shell-focus-target'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { EMPTY_HABITS_BY_ID,EMPTY_NORMALIZED_HABITS,useHabits } from '@/hooks/use-habit-queries'
import { useLogHabit,useSkipHabit } from '@/hooks/use-habit-logging'
import { useBulkLogHabits } from '@/hooks/use-bulk-log-habits'
import { useBulkSkipHabits } from '@/hooks/use-bulk-skip-habits'
import { useDeleteHabit } from '@/hooks/use-delete-habit'
import { useDuplicateHabit } from '@/hooks/use-duplicate-habit'
import { useReorderHabits } from '@/hooks/use-reorder-habits'
import { useMoveHabitParent } from '@/hooks/use-move-habit-parent'
import { useProfile } from '@/hooks/use-profile'
import { useCurrentDate } from '@/app/(tabs)/use-today-date'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { getRecentlyCompletedIdsForDate } from '@orbit/shared/utils/drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import { buildFlatHabitItems,getMoveParentSelection,validateMoveTarget as computeMoveTargetValidation,type DragItem } from '../habit-list/tree-helpers'
import { createStyles } from '../habit-list/styles'
import type { HabitListProps,HabitListHandleInputs } from '../habit-list'
import type { useHabitListDrag } from './use-habit-list-drag'

type HabitListAccountInputs = { view: NonNullable<HabitListProps['view']> } & { requestedDate: HabitListProps['selectedDate'] }

export function useHabitListAccount({ view, requestedDate }: Pick<HabitListAccountInputs, 'view' | 'requestedDate'>) {
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

export function useHabitListScroll({ accountGeneration, selectedDateStr }: Pick<HabitListScrollInputs, 'accountGeneration' | 'selectedDateStr'>, { view, isSelectMode, onScroll }: Pick<HabitListScrollInputs, 'view' | 'isSelectMode' | 'onScroll'>) {
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

export function useHabitListQueries({ filters, view }: Pick<HabitListQueriesInputs, 'filters' | 'view'>, { todayStr }: Pick<HabitListQueriesInputs, 'todayStr'>) {
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

export function useHabitRecentCompletionState({ selectedDateStr }: Pick<HabitRecentCompletionStateInputs, 'selectedDateStr'>) {
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

export function useHabitListDrill({ habitsById, habitsQuery, childrenByParent }: Pick<HabitListDrillInputs, 'habitsById' | 'habitsQuery' | 'childrenByParent'>, { selectedDateStr, todayStr }: Pick<HabitListDrillInputs, 'selectedDateStr' | 'todayStr'>, { searchQuery, showCompleted, view, onSurfaceOpenChange }: Pick<HabitListDrillInputs, 'searchQuery' | 'showCompleted' | 'view' | 'onSurfaceOpenChange'>, { recentlyCompletedIds, recentlyCompletedDates }: Pick<HabitListDrillInputs, 'recentlyCompletedIds' | 'recentlyCompletedDates'>) {
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

export function useHabitListSelectionState({ selectedHabitIds, isSelectMode }: Pick<HabitListSelectionStateInputs, 'selectedHabitIds' | 'isSelectMode'>, { recentlyCompletedIds }: Pick<HabitListSelectionStateInputs, 'recentlyCompletedIds'>) {
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

export function useHabitListVisibility({ movingHabitId }: Pick<HabitListVisibilityInputs, 'movingHabitId'>, { habitsById, childrenByParent }: Pick<HabitListVisibilityInputs, 'habitsById' | 'childrenByParent'>, { selectedDateStr }: Pick<HabitListVisibilityInputs, 'selectedDateStr'>, { searchQuery, showCompleted }: Pick<HabitListVisibilityInputs, 'searchQuery' | 'showCompleted'>, { recentlyCompletedIds }: Pick<HabitListVisibilityInputs, 'recentlyCompletedIds'>) {
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



type HabitListRootsInputs = Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListQueries>, 'topLevelHabits' | 'childrenByParent'> & Pick<HabitListProps, 'showCompleted'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'>

export function useHabitListRoots({ visibility }: Pick<HabitListRootsInputs, 'visibility'>, { view, showCompleted }: Pick<HabitListRootsInputs, 'view' | 'showCompleted'>, { topLevelHabits, childrenByParent }: Pick<HabitListRootsInputs, 'topLevelHabits' | 'childrenByParent'>, { recentlyCompletedIds }: Pick<HabitListRootsInputs, 'recentlyCompletedIds'>) {
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

export function useHabitListCollapse({ getVisibleChildren, visibleHabits, allLoadedIds }: Pick<HabitListCollapseInputs, 'getVisibleChildren' | 'visibleHabits' | 'allLoadedIds'>, { collapsedIds, setCollapsedIds }: Pick<HabitListCollapseInputs, 'collapsedIds' | 'setCollapsedIds'>, { onAllCollapsedChange, onAllLoadedIdsChange }: Pick<HabitListCollapseInputs, 'onAllCollapsedChange' | 'onAllLoadedIdsChange'>) {
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

export function useHabitListItems({ view, isSelectMode }: Pick<HabitListItemsInputs, 'view' | 'isSelectMode'>, { visibleHabits, getVisibleChildren }: Pick<HabitListItemsInputs, 'visibleHabits' | 'getVisibleChildren'>, { todayStr, i18n, t }: Pick<HabitListItemsInputs, 'todayStr' | 'i18n' | 't'>, { reserveViewport }: Pick<HabitListItemsInputs, 'reserveViewport'>, { collapsedIds }: Pick<HabitListItemsInputs, 'collapsedIds'>) {
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

export function useHabitListPresentation(drag: HabitListPresentationInputs['drag'], account: HabitListPresentationInputs['account'], { view, searchQuery, filters }: Pick<HabitListPresentationInputs, 'view' | 'searchQuery' | 'filters'>, reducedListMotion: HabitListPresentationInputs['reducedListMotion']) {
  const { activeDragItems, isDraggingList } = drag
  const { accountGeneration, selectedDateStr } = account
  const presentation = useRetainedHabitList(activeDragItems, `${accountGeneration}:${view}:${isDraggingList}:${selectedDateStr}:${searchQuery ?? ''}:${JSON.stringify(filters)}`, reducedListMotion)
  const cellMotion = useMemo(() => createListCellMotion(reducedListMotion), [reducedListMotion])
  return { presentation, cellMotion }
}

type HabitListProgressInputs = Pick<ReturnType<typeof useHabitListVisibility>, 'visibility'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListQueries>, 'getChildren' | 'habitsById'>

export function useHabitListProgress({ visibility }: Pick<HabitListProgressInputs, 'visibility'>, { view }: Pick<HabitListProgressInputs, 'view'>, { getChildren, habitsById }: Pick<HabitListProgressInputs, 'getChildren' | 'habitsById'>) {
  const childrenProgressMap = useMemo(() => computeHabitChildrenProgress(habitsById, getChildren, visibility, view), [habitsById, getChildren, visibility, view])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )
  return { getChildrenProgress }
}

type HabitMoveParentSelectionInputs = Pick<ReturnType<typeof useHabitListMoveState>, 'moveInventory' | 'bulkMovingIds' | 'movingHabitId' | 'selectedMoveParentId' | 'moveState' | 'isMovingParent'> & Pick<ReturnType<typeof useHabitListQueries>, 'maxHabitDepth' | 'moveParentMutation'> & Pick<ReturnType<typeof useHabitListAccount>, 't'>

export function useHabitMoveParentSelection({ moveInventory, bulkMovingIds, movingHabitId, selectedMoveParentId, moveState, isMovingParent }: Pick<HabitMoveParentSelectionInputs, 'moveInventory' | 'bulkMovingIds' | 'movingHabitId' | 'selectedMoveParentId' | 'moveState' | 'isMovingParent'>, { maxHabitDepth, moveParentMutation }: Pick<HabitMoveParentSelectionInputs, 'maxHabitDepth' | 'moveParentMutation'>, { t }: Pick<HabitMoveParentSelectionInputs, 't'>) {
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

export function useHabitListMoveActions({ moveState, setMoveState, moveOperation }: Pick<HabitListMoveActionsInputs, 'moveState' | 'setMoveState' | 'moveOperation'>, { habitsById, moveParentMutation }: Pick<HabitListMoveActionsInputs, 'habitsById' | 'moveParentMutation'>, { selectedHabitIds, onBulkMove }: Pick<HabitListMoveActionsInputs, 'selectedHabitIds' | 'onBulkMove'>, { canSubmitMoveParent }: Pick<HabitListMoveActionsInputs, 'canSubmitMoveParent'>, { t }: Pick<HabitListMoveActionsInputs, 't'>) {
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

export function useHabitListSubHabitActions({ collapsedIds }: Pick<HabitListSubHabitActionsInputs, 'collapsedIds'>, { toggleExpand }: Pick<HabitListSubHabitActionsInputs, 'toggleExpand'>, { setSubHabitParent, setShowSubHabitModal }: Pick<HabitListSubHabitActionsInputs, 'setSubHabitParent' | 'setShowSubHabitModal'>) {
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

export function useHabitListHandle({ ref }: Pick<HabitListHandleInputs, 'ref'>, { allCollapsed, collapseAll, expandAll }: Pick<HabitListHandleInputs, 'allCollapsed' | 'collapseAll' | 'expandAll'>, { allLoadedIds }: Pick<HabitListHandleInputs, 'allLoadedIds'>, { markRecentlyCompleted }: Pick<HabitListHandleInputs, 'markRecentlyCompleted'>, { checkAndPromptParentLog, settleBulkHabitResolutions }: Pick<HabitListHandleInputs, 'checkAndPromptParentLog' | 'settleBulkHabitResolutions'>, { openBulkMove }: Pick<HabitListHandleInputs, 'openBulkMove'>, { refetch }: Pick<HabitListHandleInputs, 'refetch'>, { scrollContainerRef, allListRef, drillListRef, stateListRef }: Pick<HabitListHandleInputs, 'scrollContainerRef' | 'allListRef' | 'drillListRef' | 'stateListRef'>) {
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

export const useHabitRecentCompletions = createUseHabitRecentCompletions({ useRef, useEffect, useCallback }, motionDurations.micro)
