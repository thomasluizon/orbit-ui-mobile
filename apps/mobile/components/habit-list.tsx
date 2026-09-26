import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
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
  canLogHabitOnDate,
  computeHabitReorderPositions,
  computeParentSettlementDecision,
  computeParentPromptProgress,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  formatAPIDateInTimeZone,
  getHabitEmptyStateKey,
  getTodayBoundary,
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
import { useCurrentDate } from '@/app/(tabs)/use-today-date'
import { useAdMob } from '@/hooks/use-ad-mob'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { addRecentCompletion, getRecentlyCompletedIdsForDate, removeRecentCompletion } from '@orbit/shared/utils/drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'
import { HabitRow, type HabitRowProps } from '@/components/habits/habit-row'
import { Skeleton } from '@/components/ui/skeleton'
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
import { HabitDrill } from './habit-list/habit-drill'
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

interface HabitListProps {
  view?: 'today' | 'all' | 'general'
  filters: HabitsFilter
  selectedDate?: Date
  showCompleted: boolean
  onShowCompleted?: () => void
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
  onSurfaceOpenChange?: (open: boolean) => void
  /** Notified whenever the set of visible habit ids changes. Parents can
   * mirror this in render-time state. */
  onAllLoadedIdsChange?: (ids: Set<string>) => void
}

interface RowActionHandlers {
  toggle: (habitId: string, intent: 'log' | 'unlog') => void
  skip: (habit: NormalizedHabit) => void
  reschedule: (habit: NormalizedHabit) => void
  expand: (habitId: string) => void
  delete: (habitId: string) => void
  duplicate: (habit: NormalizedHabit) => void
  edit: (habit: NormalizedHabit, isDrillCard: boolean) => void
  move: (habitId: string) => void
  addChild: (habitId: string) => void
  drill: (habitId: string) => void
  enterSelectMode: (habitId: string) => void
  toggleSelection: (habitId: string) => void
  detail: (habit: NormalizedHabit) => void
}

interface ActionRowProps extends Omit<HabitRowProps, 'actions'> {
  hasSubHabits: boolean
  isDrillCard: boolean
  onLongPressCard?: () => void
  handlersRef: RefObject<RowActionHandlers>
}

function ActionRow({
  habit,
  hasSubHabits,
  isDrillCard,
  onLongPressCard,
  handlersRef,
  ...rowProps
}: Readonly<ActionRowProps>) {
  const latestRef = useRef({ habit, onLongPressCard })
  useLayoutEffect(() => {
    latestRef.current = { habit, onLongPressCard }
  }, [habit, onLongPressCard])
  const hasLongPress = Boolean(onLongPressCard)
  const actions = useMemo(() => {
    const habitId = habit.id
    return {
      onLog: () => handlersRef.current.toggle(habitId, 'log'),
      onUnlog: () => handlersRef.current.toggle(habitId, 'unlog'),
      onSkip: () => handlersRef.current.skip(latestRef.current.habit),
      onReschedule: habit.isOverdue
        ? () => handlersRef.current.reschedule(latestRef.current.habit)
        : undefined,
      onToggleExpand: () => handlersRef.current.expand(habitId),
      onDelete: () => handlersRef.current.delete(habitId),
      onDuplicate: () => handlersRef.current.duplicate(latestRef.current.habit),
      onEdit: () => handlersRef.current.edit(latestRef.current.habit, isDrillCard),
      onMoveParent: () => handlersRef.current.move(habitId),
      onAddSubHabit: () => handlersRef.current.addChild(habitId),
      onDrillInto: hasSubHabits ? () => handlersRef.current.drill(habitId) : undefined,
      onEnterSelectMode: () => handlersRef.current.enterSelectMode(habitId),
      onDetail: () => handlersRef.current.detail(latestRef.current.habit),
      onToggleSelection: () => handlersRef.current.toggleSelection(habitId),
      onLongPressCard: hasLongPress
        ? () => latestRef.current.onLongPressCard?.()
        : undefined,
    }
  }, [habit.id, habit.isOverdue, handlersRef, hasLongPress, hasSubHabits, isDrillCard])

  return <HabitRow {...rowProps} habit={habit} actions={actions} />
}

export interface HabitListHandle {
  allCollapsed: boolean
  allLoadedIds: Set<string>
  collapseAll: () => void
  expandAll: () => void
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void
  refetch: () => void
  scrollToOffset: (offset: number) => void
}

const SKELETON_KEYS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
]
const KEYBOARD_SHOULD_PERSIST_TAPS = 'handled'

interface ParentSettlementPrompt {
  habit: NormalizedHabit
  mode: 'log' | 'skip'
  date: string
}

interface ParentPromptQueue {
  date: string
  prompts: ParentSettlementPrompt[]
}

function getCurrentParentPrompt(queue: ParentPromptQueue, date: string) {
  if (queue.date !== date) return null
  return queue.prompts[0] ?? null
}

function enqueueParentPrompt(
  queue: ParentPromptQueue,
  prompt: ParentSettlementPrompt,
): ParentPromptQueue {
  const prompts = queue.date === prompt.date ? queue.prompts : []
  return { date: prompt.date, prompts: [...prompts, prompt] }
}

function removeParentPrompt(
  queue: ParentPromptQueue,
  habitId: string,
  date: string,
): ParentPromptQueue {
  if (queue.date !== date) return queue
  const prompts = queue.prompts.filter((prompt) => prompt.habit.id !== habitId)
  return prompts.length === queue.prompts.length ? queue : { ...queue, prompts }
}

function removeQueuedParentPrompt(
  queue: ParentPromptQueue,
  prompt: ParentSettlementPrompt | null,
): ParentPromptQueue {
  if (!prompt) return queue
  return removeParentPrompt(queue, prompt.habit.id, prompt.date)
}

function shiftParentPrompt(queue: ParentPromptQueue, date: string): ParentPromptQueue {
  if (queue.date !== date) return queue
  return { ...queue, prompts: queue.prompts.slice(1) }
}

interface ParentSettlementData {
  getChildren: (id: string) => NormalizedHabit[]
  isListView: boolean
  visibility: ReturnType<typeof useHabitVisibility>
  habitsById: Map<string, NormalizedHabit>
  selectedDateStr: string
}

interface ParentSettlementOperation {
  data: ParentSettlementData
  date: string
  confirmedResolutions: ConfirmedResolutionRecord
  requiresLogConfirmation: boolean
}

interface ConfirmedResolutionRecord {
  date: string
  modes: Map<string, HabitResolutionMode>
  skippedIds: Set<string>
  activeSettlements: number
  clearWhenIdle: boolean
}

function getParentPromptProgress(
  habitId: string,
  confirmedResolutions: ConfirmedResolutionRecord,
  settlementData: ParentSettlementData | null,
) {
  if (!settlementData) return { done: 0, total: 0, loggedDone: 0 }
  return computeParentPromptProgress({
    parentId: habitId,
    getChildren: settlementData.getChildren,
    isRelevantToday: settlementData.visibility.isRelevantToday,
    isDueOnSelectedDate: settlementData.visibility.isDueOnSelectedDate,
    isListView: settlementData.isListView,
    skippedIds: confirmedResolutions.skippedIds,
    resolvedModes: confirmedResolutions.modes,
  })
}

function clearPersistedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  for (const habitId of confirmedResolutions.modes.keys()) {
    const habit = habitsById.get(habitId)
    const hasFlexibleSkip = habit?.flexibleTarget != null &&
      habit.flexibleCompleted != null &&
      habit.flexibleCompleted >= habit.flexibleTarget &&
      !habit.isLoggedInRange
    if (!habit?.isCompleted && !habit?.isLoggedInRange && !hasFlexibleSkip) continue
    confirmedResolutions.modes.delete(habitId)
    confirmedResolutions.skippedIds.delete(habitId)
  }
}

function refreshConfirmedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  hasQueuedParentPrompt: boolean,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  if (hasQueuedParentPrompt) {
    clearPersistedResolutions(confirmedResolutions, habitsById)
    confirmedResolutions.clearWhenIdle = false
    return
  }
  if (confirmedResolutions.activeSettlements === 0) {
    confirmedResolutions.modes.clear()
    confirmedResolutions.skippedIds.clear()
    confirmedResolutions.clearWhenIdle = false
    return
  }
  confirmedResolutions.clearWhenIdle = true
}

function createConfirmedResolutionRecord(date: string): ConfirmedResolutionRecord {
  return {
    date,
    modes: new Map(),
    skippedIds: new Set(),
    activeSettlements: 0,
    clearWhenIdle: false,
  }
}

function getDeleteConfirmation(
  habitId: string | null,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  childrenByParent: ReadonlyMap<string, string[]>,
) {
  if (!habitId) return { name: '', descendantCount: 0 }
  return {
    name: habitsById.get(habitId)?.title ?? '',
    descendantCount: collectSelectableDescendantIds(
      habitId,
      (descendantId) => childrenByParent.get(descendantId) ?? [],
    ).length,
  }
}

function getVisibleParentPrompt(
  prompt: ParentSettlementPrompt | null,
  selectedDate: string,
): { id: string; name: string; mode: 'log' | 'skip' } | null {
  if (!prompt || prompt.date !== selectedDate) return null
  return { id: prompt.habit.id, name: prompt.habit.title, mode: prompt.mode }
}

function resolveParentSettlement(
  prompt: ParentSettlementPrompt | null,
  selectedDate: string,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  getProgress: (parentId: string) => ReturnType<typeof computeParentPromptProgress>,
): { parentId: string; mode: 'log' | 'skip'; date: string } | null {
  if (!prompt || prompt.date !== selectedDate) return null
  const mode = computeParentSettlementDecision(
    habitsById.get(prompt.habit.id) ?? null,
    getProgress(prompt.habit.id),
    prompt.date,
  )
  return mode ? { parentId: prompt.habit.id, mode, date: prompt.date } : null
}

// react-doctor-disable-next-line no-giant-component -- core list orchestrator already decomposed into ./habit-list/* submodules (empty-state, date-group-section, habit-drill, move-parent-dialog, tree-helpers, styles); the remaining body is cohesive list state + handlers, extraction deferred to avoid regression without device QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export const HabitList = forwardRef<HabitListHandle, HabitListProps>(
  function HabitList(
    {
      view = 'today',
      filters,
      selectedDate,
      showCompleted,
      onShowCompleted,
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
      onSurfaceOpenChange,
      onAllLoadedIdsChange,
    },
    ref,
  ) {
    const { t, i18n } = useTranslation()
    const deviceLocale = i18n.language
    const router = useRouter()
    const pathname = usePathname()
    const { profile } = useProfile()
    const accountTimeZone = profile?.timeZone
    const todayStr = useCurrentDate(accountTimeZone)
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
    const handleListScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScroll?.(e.nativeEvent.contentOffset.y)
      },
      [onScroll],
    )
    const handleMainListOffsetChange = useCallback(
      (offsetY: number) => {
        onScroll?.(offsetY)
      },
      [onScroll],
    )

    const { config: appConfig } = useConfig()
    const maxHabitDepth = appConfig.limits.maxHabitDepth
    const habitsQuery = useHabits(filters)
    const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
    const topLevelHabits =
      habitsQuery.data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS

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
    const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : todayStr

    const logMutation = useLogHabit()
    const logMutateAsync = logMutation.mutateAsync
    const skipMutation = useSkipHabit()
    const deleteMutation = useDeleteHabit()
    const duplicateMutation = useDuplicateHabit()
    const reorderHabitsMutation = useReorderHabits()
    const moveParentMutation = useMoveHabitParent()
    const { showInterstitialIfDue } = useAdMob()
    const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
    const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)

    const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
    const [recentlyCompletedDates, setRecentlyCompletedDates] = useState(
      new Map<string, Set<string>>(),
    )
    const recentlyCompletedIds = useMemo(
      () => getRecentlyCompletedIdsForDate(recentlyCompletedDates, selectedDateStr),
      [recentlyCompletedDates, selectedDateStr],
    )
    const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt, {
      habitsById,
      childrenByParent,
      selectedDate: selectedDateStr,
      searchQuery: searchQuery ?? '',
      showCompleted,
      recentlyCompletedIds,
      recentlyCompletedDates,
    }, view)

    useEffect(() => {
      onSurfaceOpenChange?.(drill.currentParentId !== null)
    }, [drill.currentParentId, onSurfaceOpenChange])
    const pendingToggleKeysRef = useRef(new Set<string>())
    const promptedParentIdsRef = useRef(new Set<string>())
    const confirmedResolutionsRef = useRef(
      createConfirmedResolutionRecord(selectedDateStr),
    )
    const [parentPromptQueue, setParentPromptQueue] = useState<ParentPromptQueue>({
      date: selectedDateStr,
      prompts: [],
    })
    const parentPrompt = getCurrentParentPrompt(parentPromptQueue, selectedDateStr)
    const hasQueuedParentPrompt = parentPrompt !== null
    const promptDataRef = useRef<ParentSettlementData | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
    const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
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
    const deleteConfirmation = getDeleteConfirmation(
      habitToDelete,
      habitsById,
      childrenByParent,
    )
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
    useEffect(() => {
      promptedParentIdsRef.current.clear()
      confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
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
        }, 1400),
      )
    }, [selectedDateStr])

    const clearRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
      const timers = recentlyCompletedTimersRef.current
      const timerKey = `${habitId}:${date}`
      const existing = timers.get(timerKey)
      if (existing) {
        clearTimeout(existing)
        timers.delete(timerKey)
      }
      setRecentlyCompletedDates((previous) => removeRecentCompletion(previous, habitId, date))
    }, [selectedDateStr])

    const getVisibleChildren = useCallback(
      (parentId: string): NormalizedHabit[] =>
        visibility.getVisibleChildren(parentId, view),
      [view, visibility],
    )

    const visibleHabits = useMemo(() => {
      if (view === 'today') {
        return topLevelHabits.filter((habit) =>
          visibility.hasVisibleContent(habit),
        )
      }

      if (view === 'all') {
        return topLevelHabits.filter((habit) =>
          isHabitVisibleInAllView(habit, showCompleted),
        )
      }

      return showCompleted
        ? topLevelHabits
        : topLevelHabits.filter(
            (habit) => !habit.isCompleted || recentlyCompletedIds.has(habit.id),
          )
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is the extracted habitsQuery.data.topLevelHabits and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [recentlyCompletedIds, showCompleted, topLevelHabits, view, visibility])

    const dateGroups = useMemo<HabitListDateGroup[]>(() => {
      if (view !== 'all') return []

      return buildHabitDateBuckets(visibleHabits, todayStr).map((bucket) => ({
        ...bucket,
        label:
          bucket.key === '__overdue__'
            ? t('habits.overdue')
            : formatDateGroupLabel(bucket.key, deviceLocale, t),
      }))
    // react-doctor-disable-next-line exhaustive-deps -- deviceLocale is the extracted i18n.language and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    }, [deviceLocale, t, todayStr, view, visibleHabits])

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

    useEffect(() => {
      const confirmedResolutions = confirmedResolutionsRef.current
      refreshConfirmedResolutions(
        confirmedResolutions,
        hasQueuedParentPrompt,
        promptDataRef.current?.habitsById ?? EMPTY_HABITS_BY_ID,
      )
      for (const parentId of promptedParentIdsRef.current) {
        const progress = getParentPromptProgress(
          parentId,
          confirmedResolutions,
          promptDataRef.current,
        )
        if (progress.total === 0 || progress.done < progress.total) {
          promptedParentIdsRef.current.delete(parentId)
        }
      }
    }, [habitsQuery.dataUpdatedAt, hasQueuedParentPrompt])

    const recordHabitResolution = useCallback((
      confirmedResolutions: ConfirmedResolutionRecord,
      habitId: string,
      mode: HabitResolutionMode,
    ) => {
      confirmedResolutions.modes.set(habitId, mode)
      if (mode === 'skip') {
        confirmedResolutions.skippedIds.add(habitId)
      } else {
        confirmedResolutions.skippedIds.delete(habitId)
      }
    }, [])

    const finishParentSettlement = useCallback((
      confirmedResolutions: ConfirmedResolutionRecord,
    ) => {
      confirmedResolutions.activeSettlements -= 1
      if (confirmedResolutions.activeSettlements === 0 && confirmedResolutions.clearWhenIdle) {
        confirmedResolutions.modes.clear()
        confirmedResolutions.skippedIds.clear()
        confirmedResolutions.clearWhenIdle = false
      }
    }, [])

    const checkAndSettleParent = useCallback(
      function settleParentForChild(
        childHabitId: string,
        confirmedResolutions: ConfirmedResolutionRecord,
        settlementData: ParentSettlementData | null = promptDataRef.current,
      ) {
        if (!settlementData) return

        const childHabit = settlementData.habitsById.get(childHabitId)
        if (!childHabit?.parentId) return

        const parentHabit = settlementData.habitsById.get(childHabit.parentId)
        if (!parentHabit || parentHabit.isCompleted) return

        const parentIsDueOnViewedDate =
          parentHabit.isGeneral ||
          parentHabit.isOverdue ||
          hasHabitScheduleOnDate(parentHabit, settlementData.selectedDateStr)
        if (!parentIsDueOnViewedDate) return

        const mode = computeParentSettlementDecision(
          parentHabit,
          getParentPromptProgress(
            parentHabit.id,
            confirmedResolutions,
            settlementData,
          ),
          settlementData.selectedDateStr,
        )
        if (mode) {
          confirmedResolutions.clearWhenIdle = false
          if (!promptedParentIdsRef.current.has(parentHabit.id)) {
            promptedParentIdsRef.current.add(parentHabit.id)
            setParentPromptQueue((current) => enqueueParentPrompt(current, {
              habit: parentHabit,
              mode,
              date: settlementData.selectedDateStr,
            }))
          }
        } else {
          promptedParentIdsRef.current.delete(parentHabit.id)
          setParentPromptQueue((current) => removeParentPrompt(
            current,
            parentHabit.id,
            settlementData.selectedDateStr,
          ))
        }
      },
      [
        setParentPromptQueue,
      ],
    )

    const settleParentAutomatically = useCallback(
      function settleParentForChild(
        childHabitId: string,
        operation: ParentSettlementOperation,
      ) {
        const childHabit = operation.data.habitsById.get(childHabitId)
        if (!childHabit?.parentId) return
        const parentHabit = operation.data.habitsById.get(childHabit.parentId)
        if (!parentHabit) return

        const mode = computeParentSettlementDecision(
          parentHabit,
          getParentPromptProgress(
            parentHabit.id,
            operation.confirmedResolutions,
            operation.data,
          ),
          operation.date,
        )
        if (!mode) {
          promptedParentIdsRef.current.delete(parentHabit.id)
          return
        }
        if (promptedParentIdsRef.current.has(parentHabit.id)) return

        if (mode === 'log' && operation.requiresLogConfirmation) {
          checkAndSettleParent(childHabitId, operation.confirmedResolutions, operation.data)
          return
        }

        promptedParentIdsRef.current.add(parentHabit.id)
        operation.confirmedResolutions.activeSettlements += 1
        markRecentlyCompleted(parentHabit.id, operation.date)
        void (async () => {
          try {
            try {
              if (mode === 'skip') {
                await skipMutation.mutateAsync({
                  habitId: parentHabit.id,
                  date: operation.date,
                })
              } else {
                await logMutateAsync({
                  habitId: parentHabit.id,
                  date: operation.date,
                  intent: 'log',
                })
                void showInterstitialIfDue()
              }
            } catch {
              if (confirmedResolutionsRef.current === operation.confirmedResolutions) {
                promptedParentIdsRef.current.delete(parentHabit.id)
                clearRecentlyCompleted(parentHabit.id, operation.date)
              }
              return
            }

            if (
              promptDataRef.current?.selectedDateStr !== operation.date ||
              confirmedResolutionsRef.current !== operation.confirmedResolutions
            ) return
            recordHabitResolution(operation.confirmedResolutions, parentHabit.id, mode)
            settleParentForChild(parentHabit.id, operation)
          } finally {
            finishParentSettlement(operation.confirmedResolutions)
          }
        })()
      },
      [
        clearRecentlyCompleted,
        checkAndSettleParent,
        finishParentSettlement,
        logMutateAsync,
        markRecentlyCompleted,
        recordHabitResolution,
        showInterstitialIfDue,
        skipMutation,
      ],
    )

    const checkAndPromptParentLog = useCallback((childHabitId: string) => {
      const confirmedResolutions = confirmedResolutionsRef.current
      recordHabitResolution(confirmedResolutions, childHabitId, 'log')
      checkAndSettleParent(childHabitId, confirmedResolutions)
    }, [checkAndSettleParent, recordHabitResolution])

    const settleBulkHabitResolutions = useCallback((
      resolutions: readonly HabitResolution[],
      date: string,
    ) => {
      const settlementData = promptDataRef.current
      if (!settlementData) return
      for (const resolution of resolutions) {
        markRecentlyCompleted(resolution.habitId, date)
      }
      if (selectedDateStr !== date || settlementData.selectedDateStr !== date) return
      const confirmedResolutions = confirmedResolutionsRef.current
      const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
      for (const resolution of resolutions) {
        recordHabitResolution(confirmedResolutions, resolution.habitId, resolution.mode)
      }

      const childIdByAffectedParent = new Map<string, string>()
      for (const resolution of resolutions) {
        if (hasAncestorInSet(resolution.habitId, habitsById, resolvedIds)) continue
        const parentId = habitsById.get(resolution.habitId)?.parentId
        if (parentId && !childIdByAffectedParent.has(parentId)) {
          childIdByAffectedParent.set(parentId, resolution.habitId)
        }
      }

      const operation: ParentSettlementOperation = {
        data: settlementData,
        date,
        confirmedResolutions,
        requiresLogConfirmation: false,
      }
      for (const childId of childIdByAffectedParent.values()) {
        settleParentAutomatically(childId, operation)
      }
    }, [habitsById, markRecentlyCompleted, recordHabitResolution, selectedDateStr, settleParentAutomatically])

    const confirmParentSettlement = useCallback(async () => {
      const settlementData = promptDataRef.current
      const confirmedResolutions = confirmedResolutionsRef.current
      const settlement = resolveParentSettlement(
        parentPrompt,
        selectedDateStr,
        settlementData?.habitsById ?? EMPTY_HABITS_BY_ID,
        (parentId) => getParentPromptProgress(
          parentId,
          confirmedResolutions,
          settlementData,
        ),
      )
      setParentPromptQueue((current) => removeQueuedParentPrompt(current, parentPrompt))
      if (!settlement) {
        promptedParentIdsRef.current.delete(parentPrompt?.habit.id ?? '')
        return
      }
      const { parentId, mode, date } = settlement
      if (!settlementData) return
      confirmedResolutions.activeSettlements += 1
      markRecentlyCompleted(parentId, date)
      try {
        try {
          if (mode === 'skip') {
            await skipMutation.mutateAsync({ habitId: parentId, date })
          } else {
            await logMutateAsync({
              habitId: parentId,
              date,
              intent: 'log',
            })
            void showInterstitialIfDue()
          }
        } catch {
          if (confirmedResolutionsRef.current === confirmedResolutions) {
            promptedParentIdsRef.current.delete(parentId)
            clearRecentlyCompleted(parentId, date)
          }
          return
        }

        if (
          promptDataRef.current?.selectedDateStr !== date ||
          confirmedResolutionsRef.current !== confirmedResolutions
        ) return
        recordHabitResolution(confirmedResolutions, parentId, mode)
        checkAndSettleParent(parentId, confirmedResolutions, settlementData)
      } finally {
        finishParentSettlement(confirmedResolutions)
      }
    }, [
      checkAndSettleParent,
      clearRecentlyCompleted,
      finishParentSettlement,
      logMutateAsync,
      markRecentlyCompleted,
      parentPrompt,
      recordHabitResolution,
      selectedDateStr,
      showInterstitialIfDue,
      skipMutation,
      setParentPromptQueue,
    ])

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
        const currentDate = new Date()
        const accountToday = accountTimeZone === undefined
          ? formatAPIDate(currentDate)
          : formatAPIDateInTimeZone(currentDate, accountTimeZone)
        const boundary = getTodayBoundary(selectedDateStr, accountToday)
        const habit = habitsById.get(habitId)
        if (boundary === 'read-only' || (!selectedDate && selectedDateStr !== accountToday) ||
          (boundary === 'future' && (!habit || !canLogHabitOnDate(habit, selectedDateStr, accountToday)))) return
        const toggleKey = `${habitId}:${selectedDateStr}`
        const pendingToggleKeys = pendingToggleKeysRef.current
        if (pendingToggleKeys.has(toggleKey)) return

        pendingToggleKeys.add(toggleKey)
        if (intent === 'log') markRecentlyCompleted(habitId)
        let mutationSucceeded = false

        try {
          await logMutateAsync(
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
        habitsById,
        logMutateAsync,
        markRecentlyCompleted,
        accountTimeZone,
        refetch,
        selectedDate,
        selectedDateStr,
      ],
    )

    const skipHabit = useCallback(async (habit: NormalizedHabit) => {
      const currentDate = new Date()
      const accountToday = accountTimeZone === undefined
        ? formatAPIDate(currentDate)
        : formatAPIDateInTimeZone(currentDate, accountTimeZone)
      const boundary = getTodayBoundary(selectedDateStr, accountToday)
      if (boundary === 'read-only' || (boundary === 'future' &&
        !canLogHabitOnDate(habit, selectedDateStr, accountToday))) return
      const habitId = habit.id
      const date = selectedDateStr
      const settlementData = promptDataRef.current
      const confirmedResolutions = confirmedResolutionsRef.current
      try {
        await skipMutation.mutateAsync({ habitId, date })
        if (
          promptDataRef.current?.selectedDateStr !== date ||
          confirmedResolutionsRef.current !== confirmedResolutions
        ) return
        recordHabitResolution(confirmedResolutions, habitId, 'skip')
        markRecentlyCompleted(habitId)
        if (settlementData) {
          settleParentAutomatically(habitId, {
            data: settlementData,
            date,
            confirmedResolutions,
            requiresLogConfirmation: true,
          })
        }
      } catch {
      }
    }, [
      markRecentlyCompleted,
      accountTimeZone,
      recordHabitResolution,
      selectedDateStr,
      settleParentAutomatically,
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

    const confirmDuplicate = useCallback(async () => {
      if (!habitToDuplicate) return
      try {
        await duplicateMutation.mutateAsync(habitToDuplicate.id)
      } catch {
      } finally {
        setHabitToDuplicate(null)
      }
    }, [duplicateMutation, habitToDuplicate])

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
      [collapsedIds, setCollapsedIds, setDragOverrideItems, setIsDraggingList],
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

    const rowActionHandlers: RowActionHandlers = {
      toggle: (habitId, intent) => { void handleDirectToggle(habitId, intent) },
      skip: (habit) => { void skipHabit(habit) },
      reschedule: (habit) => {
        setHabitToReschedule(habit)
        setShowRescheduleSheet(true)
      },
      expand: toggleExpand,
      delete: promptDelete,
      duplicate: setHabitToDuplicate,
      edit: (habit, isDrillCard) => onEditHabit?.(
        habit,
        isDrillCard ? () => drill.refreshCurrent() : undefined,
      ),
      move: openMoveParentDialog,
      addChild: startAddSubHabit,
      drill: (habitId) => { void drill.drillInto(habitId) },
      enterSelectMode: (habitId) => {
        if (!isSelectMode) toggleSelectMode()
        toggleSelectionCascade(habitId, getDescendantIds, isAncestorSelected)
      },
      toggleSelection: (habitId) =>
        toggleSelectionCascade(habitId, getDescendantIds, isAncestorSelected),
      detail: (habit) => onDetailHabit?.(habit),
    }
    const rowActionHandlersRef = useRef(rowActionHandlers)
    useLayoutEffect(() => {
      rowActionHandlersRef.current = rowActionHandlers
    })

    const renderHabitCard = useCallback(
      (
        habit: NormalizedHabit,
        depth: number,
        hasChildren: boolean,
        hasSubHabits: boolean,
        options?: {
          isDrillCard?: boolean
          onLongPressCard?: () => void
          panelStart?: boolean
          panelEnd?: boolean
        },
      ) => {
        const progress = hasChildren
          ? getChildrenProgress(habit.id)
          : { done: 0, total: 0 }

        const row = (
          <ActionRow
            key={habit.id}
            habit={habit}
            selectedDate={selectedDate}
            today={todayStr}
            depth={depth === 0 ? 0 : 1}
            panelStart={options?.panelStart}
            panelEnd={options?.panelEnd}
            hasChildren={hasChildren}
            isExpanded={!collapsedIds.has(habit.id)}
            childrenDone={progress.done}
            childrenTotal={progress.total}
            isSelectMode={isSelectMode}
            isSelected={selectedIds.has(habit.id)}
            hasProAccess={profile?.hasProAccess !== false}
            hasSubHabits={hasSubHabits}
            isDrillCard={Boolean(options?.isDrillCard)}
            onLongPressCard={options?.onLongPressCard}
            handlersRef={rowActionHandlersRef}
          />
        )

        return row
      },
      [
        selectedDate,
        todayStr,
        collapsedIds,
        getChildrenProgress,
        isSelectMode,
        selectedIds,
        profile?.hasProAccess,
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
          onAskAstra={() => useUIStore.getState().setAstraConversationOpen(true)}
          actionLabel={t('habits.createManually')}
          onAction={onCreatePress}
          variant="primary"
        />
      ),
      [onCreatePress, t],
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
          deleteHabitName={deleteConfirmation.name}
          deleteDescendantCount={deleteConfirmation.descendantCount}
          duplicateHabitName={habitToDuplicate?.title ?? null}
          parentPrompt={getVisibleParentPrompt(parentPrompt, selectedDateStr)}
          onConfirmDelete={() => void confirmDelete()}
          onCancelDelete={() => {
            setHabitToDelete(null)
            setShowDeleteConfirm(false)
          }}
          onConfirmDuplicate={() => void confirmDuplicate()}
          onCancelDuplicate={() => setHabitToDuplicate(null)}
          onConfirmParent={() => void confirmParentSettlement()}
          onCancelParent={() => setParentPromptQueue(
            (current) => shiftParentPrompt(current, selectedDateStr),
          )}
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
          <HabitDrill
            drill={drill}
            styles={styles}
            t={t}
            hasProAccess={profile?.hasProAccess !== false}
            listHeaderComponent={listHeaderComponent}
            drillListRef={drillListRef}
            refreshControl={refreshControl}
            onListScroll={handleListScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            bulkBarStyle={bulkBarStyle}
            renderHabitCard={renderHabitCard}
            onAddSubHabit={startAddSubHabit}
            onShowCompleted={onShowCompleted}
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
            keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
            keyExtractor={(item) => item}
            renderItem={renderSkeletonItem}
            ListHeaderComponent={listHeaderComponent}
            contentContainerStyle={[
              styles.skeletonContainer,
              bulkBarStyle,
            ]}
            refreshControl={refreshControl}
            onScrollBeginDrag={onScrollBeginDrag}
            accessibilityState={{ busy: true }}
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
            keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
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
            keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
            keyExtractor={() => 'all-done'}
            renderItem={undefined}
            ListHeaderComponent={listHeaderComponent}
            ListEmptyComponent={
              <View style={styles.sectionInset}>
                <HabitListEmptyState
                  title={t('habits.allDoneToday')}
                  description={t('habits.allDoneHint')}
                  actionLabel={onSeeUpcoming ? t('habits.seeUpcoming') : undefined}
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
            keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
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
            removeClippedSubviews={false}
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
          keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
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
