import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import { FlatList as GHFlatList } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  buildHabitDateBuckets,
  computeHabitReorderPositions,
  computeParentPromptProgress,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  getHabitEmptyStateKey,
  hasAncestorInSet,
  hasHabitScheduleOnDate,
  isHabitVisibleInAllView,
  type HabitResolution,
  type HabitResolutionMode,
} from '@orbit/shared/utils'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import {
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useReorderHabits,
  useMoveHabitParent,
} from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useAdMob } from '@/hooks/use-ad-mob'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import { useTourStore } from '@/stores/tour-store'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'
import { HabitRow } from '@/components/habits/habit-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useTourTarget } from '@/hooks/use-tour-target'
import { HabitListConfirmDialogs } from './habit-list/confirm-dialogs'
import {
  getEmptyHabitsMessage,
  HabitListEmptyState,
} from './habit-list/empty-state'
import {
  formatDateGroupLabel,
  HabitListDateGroupSection,
  type HabitListDateGroup,
} from './habit-list/date-group-section'
import { DrillFooter, DrillHabitItem } from './habit-list/drill-panel'
import { HabitListDrillView } from './habit-list/drill-view'
import {
  MoveParentDialog,
  type MoveParentOption,
} from './habit-list/move-parent-dialog'
import {
  buildFlatHabitItems,
  buildMoveParentOptions,
  validateMoveTarget as computeMoveTargetValidation,
  type DragItem,
} from './habit-list/tree-helpers'
import { createStyles } from './habit-list/styles'

/**
 * Wraps a HabitRow in a measurable View that registers itself with the tour
 * registry. v8's HabitRow has no internal tour-target prop so we anchor here
 * from the parent. Renders no extra layout — the wrapping View is a sibling
 * of the row, sized to fit content.
 */
function HabitRowTourAnchor({
  targetId,
  children,
}: Readonly<{ targetId: string; children: ReactElement }>) {
  const anchorRef = useRef<View>(null)
  useTourTarget(targetId, anchorRef)
  return (
    <View ref={anchorRef} collapsable={false}>
      {children}
    </View>
  )
}

interface HabitListProps {
  view?: 'today' | 'all' | 'general'
  filters: HabitsFilter
  selectedDate?: Date
  showCompleted: boolean
  searchQuery?: string
  isSelectMode?: boolean
  selectedHabitIds?: Set<string>
  listHeader?: ReactElement | null
  onCreatePress: () => void
  onSeeUpcoming?: () => void
  onDetailHabit?: (habit: NormalizedHabit) => void
  onEditHabit?: (
    habit: NormalizedHabit,
    onSaved?: () => void | Promise<void>,
  ) => void
  onScrollBeginDrag?: () => void
  /** Notified with the vertical scroll offset of the active list, so a parent can
   * gate a scroll-to-top affordance once a long list has been scrolled. */
  onScroll?: (offsetY: number) => void
  /** Notified whenever the all-collapsed status changes. Parents can mirror
   * this in render-time state (refs cannot be read during render). */
  onAllCollapsedChange?: (allCollapsed: boolean) => void
  /** Notified whenever the set of visible habit ids changes. Parents can
   * mirror this in render-time state. */
  onAllLoadedIdsChange?: (ids: Set<string>) => void
}

export interface HabitListHandle {
  allCollapsed: boolean
  allLoadedIds: Set<string>
  collapseAll: () => void
  expandAll: () => void
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[]) => void
  refetch: () => void
  scrollToOffset: (offset: number) => void
}

const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

const SKELETON_KEYS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
]

// react-doctor-disable-next-line no-giant-component -- core list orchestrator already decomposed into ./habit-list/* submodules (empty-state, date-group-section, drill-view, move-parent-dialog, tree-helpers, styles); the remaining body is cohesive list state + handlers, extraction deferred to avoid regression without device QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export const HabitList = forwardRef<HabitListHandle, HabitListProps>(
  function HabitList(
    {
      view = 'today',
      filters,
      selectedDate,
      showCompleted,
      searchQuery,
      isSelectMode,
      selectedHabitIds,
      listHeader = null,
      onCreatePress,
      onSeeUpcoming,
      onDetailHabit,
      onEditHabit,
      onScrollBeginDrag,
      onScroll,
      onAllCollapsedChange,
      onAllLoadedIdsChange,
    },
    ref,
  ) {
    const { t, i18n } = useTranslation()
    const deviceLocale = i18n.language
    const router = useRouter()
    const pathname = usePathname()
    const { profile } = useProfile()
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(
      () => createTokensV2(currentScheme, currentTheme),
      [currentScheme, currentTheme],
    )
    const styles = useMemo(() => createStyles(tokens), [tokens])
    const bulkBarStyle = isSelectMode ? styles.listContentWithBulkBar : null
    const scrollContainerRef = useRef<GHFlatList<DragItem>>(null)
    const allViewListRef = useRef<FlatList<HabitListDateGroup>>(null)
    const drillListRef = useRef<FlatList<NormalizedHabit>>(null)
    const scrollTo = useCallback((y: number) => {
      scrollContainerRef.current?.scrollToOffset({ offset: y, animated: true })
    }, [])
    const { onTourScrollOffset } = useTourScrollContainer('/', scrollTo)
    const handleListScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScroll?.(e.nativeEvent.contentOffset.y)
      },
      [onScroll],
    )
    const handleMainListOffsetChange = useCallback(
      (offsetY: number) => {
        onTourScrollOffset(offsetY)
        onScroll?.(offsetY)
      },
      [onScroll, onTourScrollOffset],
    )

    const isTourActive = useTourStore((s) => s.isActive)
    const tourStepIndex = useTourStore((s) => s.currentStepIndex)
    useEffect(() => {
      if (!isTourActive) return
      const stepId = useTourStore.getState().getCurrentStep()?.id
      if (!stepId) return
      if (
        stepId === 'habits-tabs' ||
        stepId === 'habits-date-nav' ||
        stepId === 'habits-streak' ||
        stepId === 'habits-notifications'
      ) {
        const timer = setTimeout(() => {
          scrollContainerRef.current?.scrollToOffset({
            offset: 0,
            animated: true,
          })
        }, 400)
        return () => clearTimeout(timer)
      }
    }, [isTourActive, tourStepIndex])

    const { config: appConfig } = useConfig()
    const maxHabitDepth = appConfig.limits.maxHabitDepth
    const habitsQuery = useHabits(filters)
    const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
    const topLevelHabits =
      habitsQuery.data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS

    const tourCardHabitId = habitsById.has(TOUR_FEATURED_HABIT_ID)
      ? TOUR_FEATURED_HABIT_ID
      : topLevelHabits[0]?.id
    const totalCount = habitsQuery.data?.totalCount ?? 0
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

    const logMutation = useLogHabit()
    const skipMutation = useSkipHabit()
    const deleteMutation = useDeleteHabit()
    const duplicateMutation = useDuplicateHabit()
    const reorderHabitsMutation = useReorderHabits()
    const moveParentMutation = useMoveHabitParent()
    const { showInterstitialIfDue } = useAdMob()
    const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt)
    const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
    const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)

    const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
    const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<
      Set<string>
    >(new Set())
    const pendingToggleKeysRef = useRef(new Set<string>())
    const promptedParentIdsRef = useRef(new Set<string>())
    const skippedChildIdsRef = useRef(new Set<string>())
    const resolvedModesRef = useRef(new Map<string, HabitResolutionMode>())
    const promptDataRef = useRef<{
      getChildren: (id: string) => NormalizedHabit[]
      isListView: boolean
      visibility: ReturnType<typeof useHabitVisibility>
      habitsById: Map<string, NormalizedHabit>
      selectedDateStr: string
    } | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
    const [showSubHabitModal, setShowSubHabitModal] = useState(false)
    const [subHabitParent, setSubHabitParent] =
      useState<NormalizedHabit | null>(null)
    const [showRescheduleSheet, setShowRescheduleSheet] = useState(false)
    const [habitToReschedule, setHabitToReschedule] =
      useState<NormalizedHabit | null>(null)
    const [showMoveParentDialog, setShowMoveParentDialog] = useState(false)
    const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
    const [selectedMoveParentId, setSelectedMoveParentId] = useState<
      string | null
    >(null)
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
    const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
    useEffect(() => {
      promptedParentIdsRef.current.clear()
      skippedChildIdsRef.current.clear()
      resolvedModesRef.current.clear()
    }, [selectedDateStr])
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

    const isAncestorSelected = useCallback(
      (habitId: string): boolean => {
        let current = habitsById.get(habitId)?.parentId ?? null
        while (current) {
          if (selectedIds.has(current)) return true
          current = habitsById.get(current)?.parentId ?? null
        }
        return false
      },
      [habitsById, selectedIds],
    )

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

    const markRecentlyCompleted = useCallback((habitId: string) => {
      setRecentlyCompletedIds((previous) => new Set(previous).add(habitId))
      const timers = recentlyCompletedTimersRef.current
      const existing = timers.get(habitId)
      if (existing) clearTimeout(existing)
      timers.set(
        habitId,
        setTimeout(() => {
          timers.delete(habitId)
          setRecentlyCompletedIds((previous) => {
            const next = new Set(previous)
            next.delete(habitId)
            return next
          })
        }, 1400),
      )
    }, [])

    const clearRecentlyCompleted = useCallback((habitId: string) => {
      const timers = recentlyCompletedTimersRef.current
      const existing = timers.get(habitId)
      if (existing) {
        clearTimeout(existing)
        timers.delete(habitId)
      }
      setRecentlyCompletedIds((previous) => {
        if (!previous.has(habitId)) return previous
        const next = new Set(previous)
        next.delete(habitId)
        return next
      })
    }, [])

    const getVisibleChildren = useCallback(
      (parentId: string): NormalizedHabit[] =>
        visibility.getVisibleChildren(parentId, view),
      [view, visibility],
    )

    const visibleHabits = useMemo(() => {
      if (view === 'today') {
        if (showCompleted) return topLevelHabits
        return topLevelHabits.filter((habit) =>
          visibility.hasVisibleContent(habit),
        )
      }

      if (view === 'all') {
        return topLevelHabits.filter((habit) =>
          isHabitVisibleInAllView(habit, showCompleted),
        )
      }

      if (showCompleted) return topLevelHabits
      return topLevelHabits.filter(
        (habit) => !habit.isCompleted || recentlyCompletedIds.has(habit.id),
      )
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is the extracted habitsQuery.data.topLevelHabits and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [recentlyCompletedIds, showCompleted, topLevelHabits, view, visibility])

    const dateGroups = useMemo<HabitListDateGroup[]>(() => {
      if (view !== 'all') return []

      const today = formatAPIDate(new Date())
      return buildHabitDateBuckets(visibleHabits, today).map((bucket) => ({
        ...bucket,
        label:
          bucket.key === '__overdue__'
            ? t('habits.overdue')
            : formatDateGroupLabel(bucket.key, deviceLocale, t),
      }))
    // react-doctor-disable-next-line exhaustive-deps -- deviceLocale is the extracted i18n.language and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [deviceLocale, t, view, visibleHabits])

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
      // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- documented parent-mirror callback: HabitList computes allCollapsed internally and notifies the parent so it can mirror it in render-time state (refs cannot be read during render — see the prop JSDoc) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      onAllCollapsedChange?.(allCollapsed)
    }, [allCollapsed, onAllCollapsedChange])

    useEffect(() => {
      // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- documented parent-mirror callback: HabitList computes allLoadedIds internally and notifies the parent so it can mirror it in render-time state (refs cannot be read during render — see the prop JSDoc) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      onAllLoadedIdsChange?.(allLoadedIds)
    }, [allLoadedIds, onAllLoadedIdsChange])

    const collapseAll = useCallback(() => {
      setCollapsedIds(new Set(expandableIds))
    }, [expandableIds])

    const expandAll = useCallback(() => {
      setCollapsedIds(new Set())
    }, [])

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
    }, [])

    const [isDraggingList, setIsDraggingList] = useState(false)
    const [dragOverrideItems, setDragOverrideItems] = useState<
      DragItem[] | null
    >(null)
    const autoCollapsedOnDragRef = useRef<string | null>(null)

    const restoreCollapsedStateAfterDrag = useCallback(() => {
      setIsDraggingList(false)
      setDragOverrideItems(null)

      const autoCollapsedId = autoCollapsedOnDragRef.current
      if (!autoCollapsedId) return

      setCollapsedIds((prev) => {
        const next = new Set(prev)
        next.delete(autoCollapsedId)
        return next
      })
      autoCollapsedOnDragRef.current = null
    }, [])

    const flatItems = useMemo<DragItem[]>(
      () => buildFlatHabitItems(visibleHabits, collapsedIds, getVisibleChildren),
      [visibleHabits, collapsedIds, getVisibleChildren],
    )

    const activeDragItems = dragOverrideItems ?? flatItems
    const activeDragItemsRef = useRef(activeDragItems)
    useEffect(() => {
      activeDragItemsRef.current = activeDragItems
    // react-doctor-disable-next-line exhaustive-deps -- activeDragItems already combines dragOverrideItems and flatItems (both the analyzer flags); listing the combined value is sufficient, no staleness https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [activeDragItems])
    const isDndEnabled = view !== 'all' && !isSelectMode

    const isListView = view === 'all' || view === 'general'

    useEffect(() => {
      promptDataRef.current = {
        getChildren,
        isListView,
        visibility,
        habitsById,
        selectedDateStr,
      }
    // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById are the extracted habitsQuery members and already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [getChildren, isListView, visibility, habitsById, selectedDateStr])

    const childrenProgressMap = useMemo(() => {
      const map = new Map<string, { done: number; total: number }>()

      function computeChildProgress(
        child: NormalizedHabit,
        computeFn: (id: string) => { done: number; total: number },
      ): { done: number; total: number } {
        let done = 0
        let total = 0

        if (isListView || child.isGeneral) {
          total += 1
          if (child.isCompleted) {
            done += 1
          }
        } else if (
          !visibility.isRelevantToday(child) &&
          !child.isOverdue &&
          !child.isLoggedInRange
        ) {
          return computeFn(child.id)
        } else if (
          visibility.isDueOnSelectedDate(child) ||
          child.isOverdue ||
          child.isLoggedInRange
        ) {
          total += 1
          if (child.isCompleted || child.isLoggedInRange) {
            done += 1
          }
        }

        const nestedProgress = computeFn(child.id)
        done += nestedProgress.done
        total += nestedProgress.total

        return { done, total }
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
    }, [getChildren, habitsById, isListView, visibility])

    const getChildrenProgress = useCallback(
      (habitId: string) => {
        return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
      },
      [childrenProgressMap],
    )

    const getChildrenProgressForPrompt = useCallback((
      habitId: string,
      resolvedModes: ReadonlyMap<string, HabitResolutionMode> = resolvedModesRef.current,
    ) => {
      const data = promptDataRef.current
      if (!data) return { done: 0, total: 0, loggedDone: 0 }
      return computeParentPromptProgress({
        parentId: habitId,
        getChildren: data.getChildren,
        isRelevantToday: data.visibility.isRelevantToday,
        isDueOnSelectedDate: data.visibility.isDueOnSelectedDate,
        isListView: data.isListView,
        skippedIds: skippedChildIdsRef.current,
        resolvedModes,
      })
    }, [])

    useEffect(() => {
      resolvedModesRef.current.clear()
      for (const parentId of promptedParentIdsRef.current) {
        const progress = getChildrenProgressForPrompt(parentId)
        if (progress.total === 0 || progress.done < progress.total) {
          promptedParentIdsRef.current.delete(parentId)
        }
      }
    }, [getChildrenProgressForPrompt, habitsQuery.dataUpdatedAt])

    const recordHabitResolution = useCallback((
      habitId: string,
      mode: HabitResolutionMode,
    ) => {
      resolvedModesRef.current.set(habitId, mode)
      if (mode === 'skip') {
        skippedChildIdsRef.current.add(habitId)
      } else {
        skippedChildIdsRef.current.delete(habitId)
      }
    }, [])

    const checkAndSettleParent = useCallback(
      function settleParentForChild(
        childHabitId: string,
        resolvedModes: ReadonlyMap<string, HabitResolutionMode>,
      ) {
        const data = promptDataRef.current
        if (!data) return

        const childHabit = data.habitsById.get(childHabitId)
        if (!childHabit?.parentId) return

        const parentHabit = data.habitsById.get(childHabit.parentId)
        if (!parentHabit || parentHabit.isCompleted) return

        const parentIsDueOnViewedDate =
          parentHabit.isGeneral ||
          parentHabit.isOverdue ||
          hasHabitScheduleOnDate(parentHabit, data.selectedDateStr)
        if (!parentIsDueOnViewedDate) return

        const progress = getChildrenProgressForPrompt(parentHabit.id, resolvedModes)
        if (progress.total > 0 && progress.done >= progress.total) {
          if (!promptedParentIdsRef.current.has(parentHabit.id)) {
            promptedParentIdsRef.current.add(parentHabit.id)
            const mode = progress.loggedDone > 0 ? 'log' : 'skip'
            const ancestorResolvedModes = new Map(resolvedModes).set(parentHabit.id, mode)
            recordHabitResolution(parentHabit.id, mode)
            markRecentlyCompleted(parentHabit.id)
            void (async () => {
              try {
                if (mode === 'skip') {
                  await skipMutation.mutateAsync({ habitId: parentHabit.id, date: data.selectedDateStr })
                } else {
                  await logMutation.mutateAsync({
                    habitId: parentHabit.id,
                    date: data.selectedDateStr,
                    intent: 'log',
                  })
                  void showInterstitialIfDue()
                }
                settleParentForChild(parentHabit.id, ancestorResolvedModes)
              } catch {
                promptedParentIdsRef.current.delete(parentHabit.id)
                resolvedModesRef.current.delete(parentHabit.id)
                skippedChildIdsRef.current.delete(parentHabit.id)
                clearRecentlyCompleted(parentHabit.id)
              }
            })()
          }
        } else {
          promptedParentIdsRef.current.delete(parentHabit.id)
        }
      },
      [
        clearRecentlyCompleted,
        getChildrenProgressForPrompt,
        logMutation,
        markRecentlyCompleted,
        recordHabitResolution,
        showInterstitialIfDue,
        skipMutation,
      ],
    )

    const checkAndPromptParentLog = useCallback((childHabitId: string) => {
      recordHabitResolution(childHabitId, 'log')
      checkAndSettleParent(childHabitId, new Map(resolvedModesRef.current))
    }, [checkAndSettleParent, recordHabitResolution])

    const settleBulkHabitResolutions = useCallback((
      resolutions: readonly HabitResolution[],
    ) => {
      const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
      for (const resolution of resolutions) {
        recordHabitResolution(resolution.habitId, resolution.mode)
        markRecentlyCompleted(resolution.habitId)
      }

      const childIdByAffectedParent = new Map<string, string>()
      for (const resolution of resolutions) {
        if (hasAncestorInSet(resolution.habitId, habitsById, resolvedIds)) continue
        const parentId = habitsById.get(resolution.habitId)?.parentId
        if (parentId && !childIdByAffectedParent.has(parentId)) {
          childIdByAffectedParent.set(parentId, resolution.habitId)
        }
      }

      const resolvedSnapshot = new Map(resolvedModesRef.current)
      for (const childId of childIdByAffectedParent.values()) {
        checkAndSettleParent(childId, resolvedSnapshot)
      }
    }, [checkAndSettleParent, habitsById, markRecentlyCompleted, recordHabitResolution])

    const handleLogged = useCallback(
      (habitId: string, markAsRecentlyCompleted: boolean) => {
        if (markAsRecentlyCompleted) {
          markRecentlyCompleted(habitId)
        }

        checkAndPromptParentLog(habitId)
        void showInterstitialIfDue()
      },
      [checkAndPromptParentLog, markRecentlyCompleted, showInterstitialIfDue],
    )

    const handleDirectToggle = useCallback(
      async (habitId: string, intent: 'log' | 'unlog') => {
        const toggleKey = `${habitId}:${selectedDateStr}`
        const pendingToggleKeys = pendingToggleKeysRef.current
        if (pendingToggleKeys.has(toggleKey)) return

        pendingToggleKeys.add(toggleKey)
        if (intent === 'log') markRecentlyCompleted(habitId)
        let mutationSucceeded = false

        try {
          await logMutation.mutateAsync(
            selectedDate
              ? { habitId, date: selectedDateStr, intent }
              : { habitId, intent },
          )
          mutationSucceeded = true
          if (intent === 'log') handleLogged(habitId, false)
          await refetch()
        } catch {
          if (!mutationSucceeded && intent === 'log') clearRecentlyCompleted(habitId)
        } finally {
          pendingToggleKeys.delete(toggleKey)
        }
      },
      [
        clearRecentlyCompleted,
        handleLogged,
        logMutation,
        markRecentlyCompleted,
        refetch,
        selectedDate,
        selectedDateStr,
      ],
    )

    const skipHabit = useCallback(async (habitId: string) => {
      try {
        await skipMutation.mutateAsync({ habitId, date: selectedDateStr })
        recordHabitResolution(habitId, 'skip')
        markRecentlyCompleted(habitId)
        checkAndSettleParent(habitId, new Map(resolvedModesRef.current))
      } catch {
      }
    }, [
      checkAndSettleParent,
      markRecentlyCompleted,
      recordHabitResolution,
      selectedDateStr,
      skipMutation,
    ])

    const validateMoveTarget = useCallback(
      (targetParentId: string | null, draggedId: string) =>
        computeMoveTargetValidation(
          { habitsById, getChildren, maxHabitDepth, t },
          targetParentId,
          draggedId,
        ),
      // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById/maxHabitDepth are extracted habitsQuery/appConfig members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      [getChildren, habitsById, maxHabitDepth, t],
    )

    const moveParentOptions = useMemo<MoveParentOption[]>(() => {
      if (!movingHabitId) return []
      return buildMoveParentOptions(
        { topLevelHabits, getChildren, validateMoveTarget, t },
        movingHabitId,
      )
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits/getChildren are extracted habitsQuery members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [getChildren, movingHabitId, t, topLevelHabits, validateMoveTarget])

    const selectedMoveOption = useMemo(
      () =>
        moveParentOptions.find(
          (option) => option.id === selectedMoveParentId,
        ) ?? null,
      [moveParentOptions, selectedMoveParentId],
    )

    const canSubmitMoveParent = useMemo(
      () =>
        movingHabit !== null &&
        !moveParentMutation.isPending &&
        selectedMoveParentId !== movingHabit.parentId &&
        selectedMoveOption !== null &&
        !selectedMoveOption.disabled,
      [
        moveParentMutation.isPending,
        movingHabit,
        selectedMoveOption,
        selectedMoveParentId,
      ],
    )

    const promptDelete = useCallback((habitId: string) => {
      setHabitToDelete(habitId)
      setShowDeleteConfirm(true)
    }, [])

    const duplicateImmediately = useCallback(async (id: string) => {
      try {
        await duplicateMutation.mutateAsync(id)
      } catch {
      }
    }, [duplicateMutation])

    const closeMoveParentDialog = useCallback(() => {
      if (moveParentMutation.isPending) return

      setShowMoveParentDialog(false)
      setMovingHabitId(null)
      setSelectedMoveParentId(null)
    }, [moveParentMutation.isPending])

    const openMoveParentDialog = useCallback(
      (habitId: string) => {
        const habit = habitsById.get(habitId)
        if (!habit) return

        setMovingHabitId(habitId)
        setSelectedMoveParentId(habit.parentId)
        setShowMoveParentDialog(true)
      },
      [habitsById],
    )

    const confirmMoveParent = useCallback(async () => {
      if (!movingHabitId || !canSubmitMoveParent) return

      try {
        await moveParentMutation.mutateAsync({
          habitId: movingHabitId,
          data: { parentId: selectedMoveParentId },
        })
        closeMoveParentDialog()
      } catch {
      }
    }, [
      canSubmitMoveParent,
      closeMoveParentDialog,
      moveParentMutation,
      movingHabitId,
      selectedMoveParentId,
    ])

    const startAddSubHabit = useCallback(
      (parentId: string) => {
        if (profile?.hasProAccess === false) {
          router.push(buildUpgradeHref(pathname || '/'))
          return
        }

        const parentHabitCandidate = habitsById.get(parentId)
        if (!parentHabitCandidate) return

        if (collapsedIds.has(parentId)) {
          toggleExpand(parentId)
        }

        setSubHabitParent(parentHabitCandidate)
        setShowSubHabitModal(true)
      },
      [
        collapsedIds,
        habitsById,
        pathname,
        profile?.hasProAccess,
        router,
        toggleExpand,
      ],
    )

    const confirmDelete = useCallback(async () => {
      if (!habitToDelete) return

      try {
        await deleteMutation.mutateAsync(habitToDelete)
      } catch {
      } finally {
        setHabitToDelete(null)
        setShowDeleteConfirm(false)
      }
    }, [deleteMutation, habitToDelete])

    const prepareDrag = useCallback(
      (item: DragItem, drag: () => void) => {
        setIsDraggingList(true)
        autoCollapsedOnDragRef.current = null

        if (item.hasChildren && !collapsedIds.has(item.id)) {
          autoCollapsedOnDragRef.current = item.id
          const filtered: DragItem[] = []
          let strippingDescendants = false

          for (const candidate of activeDragItemsRef.current) {
            if (candidate.id === item.id) {
              strippingDescendants = true
              filtered.push(candidate)
              continue
            }

            if (strippingDescendants && candidate.depth > item.depth) {
              continue
            }

            strippingDescendants = false
            filtered.push(candidate)
          }

          setCollapsedIds((prev) => new Set(prev).add(item.id))
          setDragOverrideItems(filtered)
          setTimeout(drag, 0)
          return
        }

        drag()
      },
      [collapsedIds],
    )

    const handleDragEnd = useCallback(
      async ({ from, to }: { from: number; to: number }) => {
        const items = activeDragItemsRef.current

        try {
          if (from === to) return

          const positions = computeHabitReorderPositions(
            items,
            from,
            to,
            habitsById,
            getChildren,
          )

          if (positions.length > 0) {
            await reorderHabitsMutation.mutateAsync({ positions })
          }
        } catch {
        } finally {
          restoreCollapsedStateAfterDrag()
        }
      },
      // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById are extracted habitsQuery members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      [
        getChildren,
        habitsById,
        reorderHabitsMutation,
        restoreCollapsedStateAfterDrag,
      ],
    )

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
        refetch: () => {
          void refetch()
        },
        scrollToOffset: (offset: number) => {
          const target:
            | { scrollToOffset?: (params: { offset: number; animated?: boolean }) => void }
            | null =
            scrollContainerRef.current ??
            allViewListRef.current ??
            drillListRef.current
          try {
            target?.scrollToOffset?.({
              offset,
              animated: true,
            })
          } catch {
          }
        },
      }),
      // react-doctor-disable-next-line exhaustive-deps -- refetch is the extracted habitsQuery.refetch and already listed; the analyzer wants the qualified path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      [
        allCollapsed,
        allLoadedIds,
        checkAndPromptParentLog,
        collapseAll,
        expandAll,
        markRecentlyCompleted,
        refetch,
        settleBulkHabitResolutions,
      ],
    )

    const renderHabitCard = useCallback(
      (
        habit: NormalizedHabit,
        depth: number,
        hasChildren: boolean,
        hasSubHabits: boolean,
        options?: {
          isDrillCard?: boolean
          onLongPressCard?: () => void
          tourTargetId?: string
          panelStart?: boolean
          panelEnd?: boolean
        },
      ) => {
        const progress = hasChildren
          ? getChildrenProgress(habit.id)
          : { done: 0, total: 0 }

        const row = (
          <HabitRow
            key={habit.id}
            habit={habit}
            selectedDate={selectedDate}
            depth={depth === 0 ? 0 : 1}
            panelStart={options?.panelStart}
            panelEnd={options?.panelEnd}
            hasChildren={hasChildren}
            isExpanded={!collapsedIds.has(habit.id)}
            childrenDone={progress.done}
            childrenTotal={progress.total}
            isSelectMode={isSelectMode}
            isSelected={selectedIds.has(habit.id)}
            actions={{
              onLog: () => {
                void handleDirectToggle(habit.id, 'log')
              },
              onUnlog: () => {
                void handleDirectToggle(habit.id, 'unlog')
              },
              onSkip: () => {
                void skipHabit(habit.id)
              },
              onReschedule: habit.isOverdue
                ? () => {
                    setHabitToReschedule(habit)
                    setShowRescheduleSheet(true)
                  }
                : undefined,
              onToggleExpand: () => toggleExpand(habit.id),
              onDelete: () => {
                promptDelete(habit.id)
              },
              onDuplicate: () => void duplicateImmediately(habit.id),
              onEdit: () =>
                onEditHabit?.(
                  habit,
                  options?.isDrillCard
                    ? () => drill.refreshCurrent()
                    : undefined,
                ),
              onMoveParent: () => {
                openMoveParentDialog(habit.id)
              },
              onAddSubHabit: () => {
                startAddSubHabit(habit.id)
              },
              onDrillInto: hasSubHabits
                ? () => {
                    void drill.drillInto(habit.id)
                  }
                : undefined,
              onEnterSelectMode: () => {
                if (!isSelectMode) toggleSelectMode()
                toggleSelectionCascade(
                  habit.id,
                  getDescendantIds,
                  isAncestorSelected,
                )
              },
              onDetail: () => onDetailHabit?.(habit),
              onToggleSelection: () =>
                toggleSelectionCascade(
                  habit.id,
                  getDescendantIds,
                  isAncestorSelected,
                ),
              onLongPressCard: options?.onLongPressCard,
            }}
          />
        )

        if (options?.tourTargetId) {
          return (
            <HabitRowTourAnchor
              key={habit.id}
              targetId={options.tourTargetId}
            >
              {row}
            </HabitRowTourAnchor>
          )
        }

        return row
      },
      [
        selectedDate,
        collapsedIds,
        getChildrenProgress,
        isSelectMode,
        selectedIds,
        skipHabit,
        toggleExpand,
        promptDelete,
        duplicateImmediately,
        openMoveParentDialog,
        startAddSubHabit,
        drill,
        handleDirectToggle,
        toggleSelectMode,
        toggleSelectionCascade,
        getDescendantIds,
        isAncestorSelected,
        onDetailHabit,
        onEditHabit,
      ],
    )

    /* No Reanimated entering animation here: a layout animation nested inside a
       react-native-draggable-flatlist cell fights the cell's own translateY transform
       and mis-positions rows. https://github.com/thomasluizon/orbit-ui-mobile/pull/486 */
    const renderItem = useCallback(
      ({ item, drag, getIndex }: RenderItemParams<DragItem>) => {
        const index = getIndex() ?? 0
        const nextItem = activeDragItems[index + 1]
        return renderHabitCard(
          item.habit,
          item.depth,
          item.hasChildren,
          item.hasSubHabits,
          {
            onLongPressCard: isDndEnabled
              ? () => prepareDrag(item, drag)
              : undefined,
            tourTargetId:
              item.habit.id === tourCardHabitId
                ? 'tour-habit-card'
                : undefined,
            panelStart: item.depth === 0,
            panelEnd: !nextItem || nextItem.depth === 0,
          },
        )
      },
      [
        activeDragItems,
        isDndEnabled,
        prepareDrag,
        renderHabitCard,
        tourCardHabitId,
      ],
    )

    const keyExtractor = useCallback((item: DragItem) => item.id, [])

    const renderSkeletonItem = useCallback(
      () => (
        <View style={styles.sectionInset}>
          <Skeleton variant="habit-row" label={t('common.loading')} />
        </View>
      ),
      [styles, t],
    )

    const renderEmptyState = useCallback(
      (currentView: 'today' | 'all' | 'general') => (
        <HabitListEmptyState
                  title={currentView === 'today' ? t('habits.emptyState') : t(getHabitEmptyStateKey(currentView))}
                  description={currentView === 'today' ? t('habits.noHabitsBody') : getEmptyHabitsMessage(currentView, t)}
          askAstraLabel={t('habits.askAstra')}
          onAskAstra={() => router.push('/chat')}
          actionLabel={t('habits.createManually')}
          onAction={onCreatePress}
          variant="primary"
        />
      ),
      [onCreatePress, router, t],
    )

    const listHeaderComponent = useMemo(
      () =>
        listHeader ? (
          <View style={styles.sectionInset}>{listHeader}</View>
        ) : null,
      [listHeader, styles.sectionInset],
    )

    const insets = useSafeAreaInsets()
    const refreshControl = useMemo(
      () => (
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          tintColor={tokens.primary}
          progressViewOffset={insets.top}
        />
      ),
      // react-doctor-disable-next-line exhaustive-deps -- isFetching/isLoading/refetch are extracted habitsQuery members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      [tokens.primary, insets.top, isFetching, isLoading, refetch],
    )

    const renderGroupSection = useCallback<ListRenderItem<HabitListDateGroup>>(
      ({ item: group }) => (
        <HabitListDateGroupSection
          group={group}
          overdueLabel={t('habits.overdue')}
          renderHabit={(habit) => {
            const panelItems = buildFlatHabitItems(
              [habit],
              collapsedIds,
              getVisibleChildren,
            )
            return (
              <View>
                {panelItems.map((item, index) =>
                  renderHabitCard(
                    item.habit,
                    item.depth,
                    item.hasChildren,
                    item.hasSubHabits,
                    {
                      panelStart: index === 0,
                      panelEnd: index === panelItems.length - 1,
                    },
                  ),
                )}
              </View>
            )
          }}
        />
      ),
      [
        collapsedIds,
        getVisibleChildren,
        renderHabitCard,
        t,
      ],
    )

    const renderDrillItem = useCallback<ListRenderItem<NormalizedHabit>>(
      ({ item: child }) => (
        <DrillHabitItem
          child={child}
          styles={styles}
          getDrillChildren={drill.getDrillChildren}
          renderHabitCard={renderHabitCard}
        />
      ),
      [drill.getDrillChildren, renderHabitCard, styles],
    )

    const drillFooter = useMemo(
      () => (
        <DrillFooter
          styles={styles}
          label={t('habits.form.addSubHabit')}
          onAddSubHabit={() => {
            const parent = drill.currentParentId
              ? (habitsById.get(drill.currentParentId) ?? null)
              : null
            setSubHabitParent(parent)
            setShowSubHabitModal(true)
          }}
        />
      ),
      [drill.currentParentId, habitsById, styles, t],
    )

    const commonOverlays = (
      <>
        <CreateHabitModal
          open={showSubHabitModal}
          onClose={() => {
            setShowSubHabitModal(false)
            setSubHabitParent(null)
          }}
          initialDate={selectedDate ? formatAPIDate(selectedDate) : null}
          parentHabit={subHabitParent}
        />

        <RescheduleSheet
          open={showRescheduleSheet}
          onOpenChange={(open) => {
            setShowRescheduleSheet(open)
            if (!open) setHabitToReschedule(null)
          }}
          habit={habitToReschedule}
        />

        <HabitListConfirmDialogs
          t={t}
          showDeleteConfirm={showDeleteConfirm}
          onConfirmDelete={() => void confirmDelete()}
          onCancelDelete={() => {
            setHabitToDelete(null)
            setShowDeleteConfirm(false)
          }}
        />

        <MoveParentDialog
          t={t}
          visible={showMoveParentDialog}
          isPending={moveParentMutation.isPending}
          movingHabitTitle={movingHabit?.title ?? null}
          movingHabitParentId={movingHabit?.parentId ?? null}
          options={moveParentOptions}
          selectedMoveParentId={selectedMoveParentId}
          canSubmit={canSubmitMoveParent}
          onClose={closeMoveParentDialog}
          onConfirm={() => {
            void confirmMoveParent()
          }}
          onSelectOption={setSelectedMoveParentId}
        />
      </>
    )

    if (drill.currentParentId) {
      return (
        <>
          <HabitListDrillView
            drill={drill}
            styles={styles}
            listHeaderComponent={listHeaderComponent}
            drillListRef={drillListRef}
            renderDrillItem={renderDrillItem}
            drillFooter={drillFooter}
            refreshControl={refreshControl}
            onListScroll={handleListScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            bulkBarStyle={bulkBarStyle}
          />
          {commonOverlays}
        </>
      )
    }

    if (isLoading) {
      return (
        <>
          <FlatList
            data={SKELETON_KEYS}
            keyExtractor={(item) => item}
            renderItem={renderSkeletonItem}
            ListHeaderComponent={listHeaderComponent}
            contentContainerStyle={[
              styles.skeletonContainer,
              bulkBarStyle,
            ]}
            refreshControl={refreshControl}
            onScrollBeginDrag={onScrollBeginDrag}
            showsVerticalScrollIndicator={false}
          />
          {commonOverlays}
        </>
      )
    }

    if (isError && !habitsQuery.data) {
      return (
        <>
          <FlatList
            data={[]}
            keyExtractor={() => 'load-error'}
            renderItem={undefined}
            ListHeaderComponent={listHeaderComponent}
            ListEmptyComponent={
              <HabitListEmptyState
                title={t('habits.loadError')}
                description=""
                actionLabel={t('common.retry')}
                onAction={() => void refetch()}
                variant="secondary"
              />
            }
            contentContainerStyle={[styles.listContent, bulkBarStyle]}
            refreshControl={refreshControl}
            onScrollBeginDrag={onScrollBeginDrag}
            showsVerticalScrollIndicator={false}
          />
          {commonOverlays}
        </>
      )
    }

    if (
      flatItems.length === 0 &&
      totalCount > 0 &&
      !showCompleted &&
      view === 'today'
    ) {
      return (
        <>
          <FlatList
            data={[]}
            keyExtractor={() => 'all-done'}
            renderItem={undefined}
            ListHeaderComponent={listHeaderComponent}
            ListEmptyComponent={
              <View style={styles.sectionInset}>
                <HabitListEmptyState
                  title={t('habits.allDoneToday')}
                  description={t('habits.allDoneHint')}
                  actionLabel={t('habits.seeUpcoming')}
                  onAction={onSeeUpcoming}
                  variant="secondary"
                />
              </View>
            }
            contentContainerStyle={[
              styles.listContent,
              bulkBarStyle,
            ]}
            refreshControl={refreshControl}
            onScrollBeginDrag={onScrollBeginDrag}
            showsVerticalScrollIndicator={false}
          />
          {commonOverlays}
        </>
      )
    }

    if (view === 'all') {
      return (
        <>
          <FlatList
            ref={allViewListRef}
            data={dateGroups}
            keyExtractor={(item) => item.key}
            renderItem={renderGroupSection}
            ListHeaderComponent={listHeaderComponent}
            ListEmptyComponent={renderEmptyState('all')}
            contentContainerStyle={[
              styles.groupedList,
              bulkBarStyle,
            ]}
            refreshControl={refreshControl}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={onScrollBeginDrag}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={5}
            windowSize={5}
            removeClippedSubviews={true}
          />
          {commonOverlays}
        </>
      )
    }

    return (
      <>
        <DraggableFlatList
          ref={scrollContainerRef}
          data={activeDragItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={listExtraData}
          testID={isDraggingList ? 'dragging-habit-list' : 'habit-list'}
          contentContainerStyle={[
            styles.listContent,
            bulkBarStyle,
          ]}
          refreshControl={refreshControl}
          onDragEnd={(params) => void handleDragEnd(params)}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={renderEmptyState(view)}
          // WHY: DraggableFlatList overwrites any caller onScroll with its own reanimated handler; onScrollOffsetChange is its supported scroll-offset API https://github.com/computerjazz/react-native-draggable-flatlist/blob/v4.0.3/src/components/DraggableFlatList.tsx#L396
          onScrollOffsetChange={handleMainListOffsetChange}
          onScrollBeginDrag={onScrollBeginDrag}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={11}
        />
        {commonOverlays}
      </>
    )
  },
)
