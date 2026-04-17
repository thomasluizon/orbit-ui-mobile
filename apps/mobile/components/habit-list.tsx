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
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import { FlatList as GHFlatList } from 'react-native-gesture-handler'
import {
  isToday as isDateToday,
  isTomorrow,
  isYesterday,
} from 'date-fns'
import {
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  computeHabitReorderPositions,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  formatLocaleDate,
  getHabitEmptyStateKey,
  hasHabitScheduleOnDate,
  type ReorderableHabitItem,
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
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { useAppTheme } from '@/lib/use-app-theme'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useUIStore } from '@/stores/ui-store'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import { useTourStore } from '@/stores/tour-store'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { HabitCard } from './habit-card'
import {
  HabitListDateGroupSection,
  HabitListEmptyState,
  type HabitListDateGroup,
} from './habit-list-sections'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  onLogHabit?: (habit: NormalizedHabit) => void
  onDetailHabit?: (habit: NormalizedHabit) => void
  onEditHabit?: (habit: NormalizedHabit) => void
  onScrollBeginDrag?: () => void
}

export interface HabitListHandle {
  allCollapsed: boolean
  allLoadedIds: Set<string>
  collapseAll: () => void
  expandAll: () => void
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  refetch: () => void
  scrollToOffset: (offset: number) => void
}

// ---------------------------------------------------------------------------
// Skeleton card for loading state
// ---------------------------------------------------------------------------

type ThemeColors = ReturnType<typeof useAppTheme>['colors']
type HabitListStyles = ReturnType<typeof createStyles>

function SkeletonCard({ styles }: { styles: HabitListStyles }) {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonCircle} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonSubtitle} />
      </View>
    </View>
  )
}

function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}

interface MoveParentOption {
  id: string | null
  label: string
  depth: number
  disabled: boolean
  reason: string | null
}

interface DragItem extends ReorderableHabitItem {
  id: string
  habit: NormalizedHabit
  depth: number
  hasChildren: boolean
  hasSubHabits: boolean
}

function formatDateGroupLabel(
  key: string,
  locale: string,
  t: (key: string) => string,
): string {
  if (!key) return t('common.unknown')

  const date = new Date(`${key}T00:00:00`)

  if (isDateToday(date)) return t('dates.today')
  if (isTomorrow(date)) return t('dates.tomorrow')
  if (isYesterday(date)) return t('dates.yesterday')

  return formatLocaleDate(date, locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// HabitList
// ---------------------------------------------------------------------------

export const HabitList = forwardRef<HabitListHandle, HabitListProps>(function HabitList(
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
    onLogHabit,
    onDetailHabit,
    onEditHabit,
    onScrollBeginDrag,
  },
  ref,
) {
  const { t } = useTranslation()
  const deviceLocale = useDeviceLocale()
  const router = useRouter()
  const { profile } = useProfile()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const scrollContainerRef = useRef<GHFlatList<DragItem>>(null)
  const scrollTo = useCallback((y: number) => {
    scrollContainerRef.current?.scrollToOffset({ offset: y, animated: true })
  }, [])
  const { onTourScroll } = useTourScrollContainer('/', scrollTo)

  // When the tour step changes, scroll the list to show the target
  const isTourActive = useTourStore((s) => s.isActive)
  const tourStepIndex = useTourStore((s) => s.currentStepIndex)
  useEffect(() => {
    if (!isTourActive) return
    const stepId = useTourStore.getState().getCurrentStep()?.id
    if (!stepId) return
    // Steps that need the list scrolled down (to show habit cards)
    if (stepId === 'habits-list' || stepId === 'habits-card' || stepId === 'habits-tags') {
      const timer = setTimeout(() => {
        scrollContainerRef.current?.scrollToOffset({ offset: 350, animated: true })
      }, 400)
      return () => clearTimeout(timer)
    }
    // Steps that need the list scrolled up (to show header elements)
    if (stepId === 'habits-tabs' || stepId === 'habits-date-nav' || stepId === 'habits-streak' || stepId === 'habits-notifications') {
      const timer = setTimeout(() => {
        scrollContainerRef.current?.scrollToOffset({ offset: 0, animated: true })
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isTourActive, tourStepIndex])

  const { config: appConfig } = useConfig()
  const maxHabitDepth = appConfig.limits.maxHabitDepth
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const topLevelHabits = habitsQuery.data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS
  const totalCount = habitsQuery.data?.totalCount ?? 0
  const isLoading = habitsQuery.isLoading
  const isFetching = habitsQuery.isFetching
  const refetch = habitsQuery.refetch
  const getChildren = habitsQuery.getChildren
  const childrenByParent = habitsQuery.data?.childrenByParent ?? new Map<string, string[]>()

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

  // Collapse state
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<Set<string>>(new Set())
  const recentlyCompletedPromptIdsRef = useRef(new Set<string>())
  const [showForceLogConfirm, setShowForceLogConfirm] = useState(false)
  const [forceLogHabitId, setForceLogHabitId] = useState<string | null>(null)
  const [showAutoLogParent, setShowAutoLogParent] = useState(false)
  const [autoLogParentId, setAutoLogParentId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [habitToSkip, setHabitToSkip] = useState<string | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] = useState<NormalizedHabit | null>(null)
  const [showMoveParentDialog, setShowMoveParentDialog] = useState(false)
  const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
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
  const autoLogParentHabit = autoLogParentId ? habitsById.get(autoLogParentId) ?? null : null
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null

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

  const markRecentlyCompleted = useCallback((habitId: string) => {
    recentlyCompletedPromptIdsRef.current.add(habitId)
    setRecentlyCompletedIds((previous) => new Set(previous).add(habitId))
    setTimeout(() => {
      recentlyCompletedPromptIdsRef.current.delete(habitId)
      setRecentlyCompletedIds((previous) => {
        const next = new Set(previous)
        next.delete(habitId)
        return next
      })
    }, 1400)
  }, [])

  const clearRecentlyCompleted = useCallback((habitId: string) => {
    recentlyCompletedPromptIdsRef.current.delete(habitId)
    setRecentlyCompletedIds((previous) => {
      if (!previous.has(habitId)) return previous
      const next = new Set(previous)
      next.delete(habitId)
      return next
    })
  }, [])

  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] => visibility.getVisibleChildren(parentId, view),
    [view, visibility],
  )

  const visibleHabits = useMemo(() => {
    if (view === 'today') {
      if (showCompleted) return topLevelHabits
      return topLevelHabits.filter((habit) => visibility.hasVisibleContent(habit))
    }

    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter(
      (habit) => !habit.isCompleted || recentlyCompletedIds.has(habit.id),
    )
  }, [recentlyCompletedIds, showCompleted, topLevelHabits, view, visibility])

  const dateGroups = useMemo<HabitListDateGroup[]>(() => {
    if (view !== 'all') return []

    const today = formatAPIDate(new Date())
    const overdueHabits: NormalizedHabit[] = []
    const groups = new Map<string, NormalizedHabit[]>()

    for (const habit of visibleHabits) {
      const key = habit.dueDate ?? ''
      if (!key) {
        const group = groups.get('') ?? []
        group.push(habit)
        groups.set('', group)
        continue
      }

      if (key < today && !habit.isCompleted) {
        overdueHabits.push(habit)
        continue
      }

      const group = groups.get(key) ?? []
      group.push(habit)
      groups.set(key, group)
    }

    const result: HabitListDateGroup[] = []

    if (overdueHabits.length > 0) {
      result.push({
        key: '__overdue__',
        label: t('habits.overdue'),
        isOverdue: true,
        habits: [...overdueHabits].sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
      })
    }

    const sortedGroups = Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))
    for (const [key, habits] of sortedGroups) {
      result.push({
        key,
        label: formatDateGroupLabel(key, deviceLocale, t),
        isOverdue: false,
        habits,
      })
    }

    return result
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
    () => expandableIds.length > 0 && expandableIds.every((id) => collapsedIds.has(id)),
    [collapsedIds, expandableIds],
  )

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

  const flatItems = useMemo<DragItem[]>(() => {
    const items: DragItem[] = []

    function addHabitTree(habit: NormalizedHabit, depth: number) {
      const children = getVisibleChildren(habit.id)
      items.push({
        id: habit.id,
        parentId: habit.parentId ?? null,
        habit,
        depth,
        hasChildren: children.length > 0,
        hasSubHabits: habit.hasSubHabits,
      })
      if (!collapsedIds.has(habit.id)) {
        for (const child of children) {
          addHabitTree(child, depth + 1)
        }
      }
    }

    for (const h of visibleHabits) {
      addHabitTree(h, 0)
    }

    return items
  }, [visibleHabits, collapsedIds, getVisibleChildren])

  const [isDraggingList, setIsDraggingList] = useState(false)
  const [dragOverrideItems, setDragOverrideItems] = useState<DragItem[] | null>(null)
  const activeDragItems = dragOverrideItems ?? flatItems
  const activeDragItemsRef = useRef(activeDragItems)
  activeDragItemsRef.current = activeDragItems
  const autoCollapsedOnDragRef = useRef<string | null>(null)
  const isDndEnabled = view !== 'all' && !isSelectMode

  const isListView = view === 'all' || view === 'general'

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
      } else if (!visibility.isRelevantToday(child) && !child.isLoggedInRange) {
        return computeFn(child.id)
      } else if (visibility.isDueOnSelectedDate(child) || child.isLoggedInRange) {
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
  }, [getChildren, habitsById, isListView, visibility])

  const getChildrenProgress = useCallback((habitId: string) => {
    return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
  }, [childrenProgressMap])

  const getChildrenProgressForPrompt = useCallback((habitId: string) => {
    const completedOverrideIds = recentlyCompletedPromptIdsRef.current

    function computeChildProgress(
      child: NormalizedHabit,
      computeFn: (id: string) => { done: number; total: number },
    ): { done: number; total: number } {
      let done = 0
      let total = 0
      const isCompletedForPrompt =
        child.isCompleted ||
        child.isLoggedInRange ||
        completedOverrideIds.has(child.id)

      if (isListView || child.isGeneral) {
        total += 1
        if (isCompletedForPrompt) {
          done += 1
        }
      } else if (!visibility.isRelevantToday(child) && !child.isLoggedInRange) {
        return computeFn(child.id)
      } else if (visibility.isDueOnSelectedDate(child) || child.isLoggedInRange) {
        total += 1
        if (isCompletedForPrompt) {
          done += 1
        }
      }

      const nestedProgress = computeFn(child.id)
      done += nestedProgress.done
      total += nestedProgress.total

      return { done, total }
    }

    function compute(currentHabitId: string): { done: number; total: number } {
      const children = getChildren(currentHabitId)
      if (children.length === 0) {
        return { done: 0, total: 0 }
      }

      let done = 0
      let total = 0

      for (const child of children) {
        const progress = computeChildProgress(child, compute)
        done += progress.done
        total += progress.total
      }

      return { done, total }
    }

    return compute(habitId)
  }, [getChildren, isListView, visibility])

  const checkAndPromptParentLog = useCallback((childHabitId: string) => {
    const childHabit = habitsById.get(childHabitId)
    if (!childHabit?.parentId) return

    const parentHabit = habitsById.get(childHabit.parentId)
    if (!parentHabit || parentHabit.isCompleted) return

    // Only prompt if the parent itself is due today, overdue, or a general habit
    const parentIsDueToday =
      parentHabit.isGeneral ||
      parentHabit.isOverdue ||
      hasHabitScheduleOnDate(parentHabit, selectedDateStr)
    if (!parentIsDueToday) return

    const progress = getChildrenProgressForPrompt(parentHabit.id)
    if (progress.total > 0 && progress.done >= progress.total) {
      setAutoLogParentId(parentHabit.id)
      setShowAutoLogParent(true)
    }
  }, [getChildrenProgressForPrompt, habitsById, selectedDateStr])

  const handleLogged = useCallback((habitId: string, markAsRecentlyCompleted = true) => {
    if (markAsRecentlyCompleted) {
      markRecentlyCompleted(habitId)
    }

    checkAndPromptParentLog(habitId)
    void showInterstitialIfDue()
  }, [checkAndPromptParentLog, markRecentlyCompleted, showInterstitialIfDue])

  const handleDirectLog = useCallback(async (habitId: string) => {
    markRecentlyCompleted(habitId)

    try {
      await logMutation.mutateAsync({ habitId })
      handleLogged(habitId, false)
    } catch {
      clearRecentlyCompleted(habitId)
      // Error handled by mutation
    }
  }, [clearRecentlyCompleted, handleLogged, logMutation, markRecentlyCompleted])

  const confirmAutoLogParent = useCallback(async () => {
    const parentId = autoLogParentId
    if (!parentId) return

    setShowAutoLogParent(false)
    setAutoLogParentId(null)
    markRecentlyCompleted(parentId)

    try {
      await logMutation.mutateAsync({ habitId: parentId })
      handleLogged(parentId, false)
    } catch {
      clearRecentlyCompleted(parentId)
      // Error handled by mutation
    }
  }, [autoLogParentId, clearRecentlyCompleted, handleLogged, logMutation, markRecentlyCompleted])

  const promptForceLogParent = useCallback((habitId: string) => {
    setForceLogHabitId(habitId)
    setShowForceLogConfirm(true)
  }, [])

  const confirmForceLog = useCallback(async () => {
    if (!forceLogHabitId) return

    markRecentlyCompleted(forceLogHabitId)

    try {
      await logMutation.mutateAsync({ habitId: forceLogHabitId })
      handleLogged(forceLogHabitId, false)
    } catch {
      clearRecentlyCompleted(forceLogHabitId)
      // Error handled by mutation
    } finally {
      setForceLogHabitId(null)
      setShowForceLogConfirm(false)
    }
  }, [forceLogHabitId, clearRecentlyCompleted, handleLogged, logMutation, markRecentlyCompleted])

  const promptSkip = useCallback((habitId: string) => {
    setHabitToSkip(habitId)
    setShowSkipConfirm(true)
  }, [])

  const confirmSkip = useCallback(async () => {
    if (!habitToSkip) return

    const skippedId = habitToSkip
    try {
      await skipMutation.mutateAsync({ habitId: skippedId })
      markRecentlyCompleted(skippedId)
      checkAndPromptParentLog(skippedId)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToSkip(null)
      setShowSkipConfirm(false)
    }
  }, [checkAndPromptParentLog, habitToSkip, markRecentlyCompleted, skipMutation])

  const isPostponeAction = useMemo(() => {
    if (!habitToSkip) return false
    const habit = habitsById.get(habitToSkip)
    return habit ? !habit.frequencyUnit : false
  }, [habitToSkip, habitsById])

  const skipConfirmMessage = useMemo(() => {
    if (isPostponeAction) return t('habits.postponeConfirmMessage')

    if (habitToSkip) {
      const habit = habitsById.get(habitToSkip)
      if (habit?.flexibleTarget != null) {
        return t('habits.skipConfirmMessageFlexible')
      }
    }

    return t('habits.skipConfirmMessage')
  }, [habitToSkip, habitsById, isPostponeAction, t])

  const getHabitDepth = useCallback((habitId: string): number => {
    let depth = 0
    let current = habitsById.get(habitId)

    while (current?.parentId) {
      depth += 1
      current = habitsById.get(current.parentId)
    }

    return depth
  }, [habitsById])

  const getSubtreeMaxDepth = useCallback((habitId: string, baseDepth: number): number => {
    let maxDepth = baseDepth
    const children = getChildren(habitId)

    for (const child of children) {
      const childMaxDepth = getSubtreeMaxDepth(child.id, baseDepth + 1)
      if (childMaxDepth > maxDepth) {
        maxDepth = childMaxDepth
      }
    }

    return maxDepth
  }, [getChildren])

  const isDescendant = useCallback((candidateId: string, ancestorId: string): boolean => {
    let current = habitsById.get(candidateId)

    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true
      }
      current = habitsById.get(current.parentId)
    }

    return false
  }, [habitsById])

  const validateMoveTarget = useCallback((targetParentId: string | null, draggedId: string) => {
    if (targetParentId === draggedId) {
      return {
        valid: false,
        reason: t('habits.moveParent.invalidSelf'),
      }
    }

    if (targetParentId && isDescendant(targetParentId, draggedId)) {
      return {
        valid: false,
        reason: t('habits.moveParent.invalidDescendant'),
      }
    }

    const newParentDepth = targetParentId ? getHabitDepth(targetParentId) : -1
    const subtreeMaxDepth = getSubtreeMaxDepth(draggedId, newParentDepth + 1)

    if (subtreeMaxDepth >= maxHabitDepth) {
      return {
        valid: false,
        reason: t('habits.moveParent.invalidDepth', { max: maxHabitDepth }),
      }
    }

    return {
      valid: true,
      reason: null,
    }
  }, [getHabitDepth, getSubtreeMaxDepth, isDescendant, maxHabitDepth, t])

  const moveParentOptions = useMemo<MoveParentOption[]>(() => {
    if (!movingHabitId) return []
    const movingId = movingHabitId

    const options: MoveParentOption[] = []
    const rootValidation = validateMoveTarget(null, movingId)

    options.push({
      id: null,
      label: t('habits.moveParent.toRoot'),
      depth: 0,
      disabled: !rootValidation.valid,
      reason: rootValidation.reason,
    })

    function addOption(habit: NormalizedHabit, depth: number) {
      const validation = validateMoveTarget(habit.id, movingId)
      options.push({
        id: habit.id,
        label: habit.title,
        depth,
        disabled: !validation.valid,
        reason: validation.reason,
      })

      const children = getChildren(habit.id)
      for (const child of children) {
        addOption(child, depth + 1)
      }
    }

    for (const habit of topLevelHabits) {
      addOption(habit, 0)
    }

    return options
  }, [getChildren, movingHabitId, t, topLevelHabits, validateMoveTarget])

  const selectedMoveOption = useMemo(
    () => moveParentOptions.find((option) => option.id === selectedMoveParentId) ?? null,
    [moveParentOptions, selectedMoveParentId],
  )

  const canSubmitMoveParent = useMemo(
    () =>
      movingHabit !== null &&
      !moveParentMutation.isPending &&
      selectedMoveParentId !== movingHabit.parentId &&
      selectedMoveOption !== null &&
      !selectedMoveOption.disabled,
    [moveParentMutation.isPending, movingHabit, selectedMoveOption, selectedMoveParentId],
  )

  const promptDelete = useCallback((habitId: string) => {
    setHabitToDelete(habitId)
    setShowDeleteConfirm(true)
  }, [])

  const promptDuplicate = useCallback((habitId: string) => {
    const habit = habitsById.get(habitId)
    if (!habit) return
    setHabitToDuplicate(habit)
    setShowDuplicateConfirm(true)
  }, [habitsById])

  const confirmDuplicate = useCallback(async () => {
    if (!habitToDuplicate) return
    const id = habitToDuplicate.id
    try {
      await duplicateMutation.mutateAsync(id)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToDuplicate(null)
      setShowDuplicateConfirm(false)
    }
  }, [duplicateMutation, habitToDuplicate])

  const closeMoveParentDialog = useCallback(() => {
    if (moveParentMutation.isPending) return

    setShowMoveParentDialog(false)
    setMovingHabitId(null)
    setSelectedMoveParentId(null)
  }, [moveParentMutation.isPending])

  const openMoveParentDialog = useCallback((habitId: string) => {
    const habit = habitsById.get(habitId)
    if (!habit) return

    setMovingHabitId(habitId)
    setSelectedMoveParentId(habit.parentId)
    setShowMoveParentDialog(true)
  }, [habitsById])

  const confirmMoveParent = useCallback(async () => {
    if (!movingHabitId || !canSubmitMoveParent) return

    try {
      await moveParentMutation.mutateAsync({
        habitId: movingHabitId,
        data: { parentId: selectedMoveParentId },
      })
      closeMoveParentDialog()
    } catch {
      // Error handled by mutation
    }
  }, [canSubmitMoveParent, closeMoveParentDialog, moveParentMutation, movingHabitId, selectedMoveParentId])

  const startAddSubHabit = useCallback((parentId: string) => {
    if (profile?.hasProAccess === false) {
      router.push('/upgrade')
      return
    }

    const parentHabitCandidate = habitsById.get(parentId)
    if (!parentHabitCandidate) return

    if (collapsedIds.has(parentId)) {
      toggleExpand(parentId)
    }

    setSubHabitParent(parentHabitCandidate)
    setShowSubHabitModal(true)
  }, [collapsedIds, habitsById, profile?.hasProAccess, router, toggleExpand])

  const confirmDelete = useCallback(async () => {
    if (!habitToDelete) return

    try {
      await deleteMutation.mutateAsync(habitToDelete)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToDelete(null)
      setShowDeleteConfirm(false)
    }
  }, [deleteMutation, habitToDelete])

  const prepareDrag = useCallback((item: DragItem, drag: () => void) => {
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
  }, [collapsedIds])

  const handleDragEnd = useCallback(async ({ from, to }: { from: number; to: number }) => {
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
      // Error handled by mutation
    } finally {
      restoreCollapsedStateAfterDrag()
    }
  }, [getChildren, habitsById, reorderHabitsMutation, restoreCollapsedStateAfterDrag])

  useImperativeHandle(
    ref,
    () => ({
      allCollapsed,
      allLoadedIds,
      collapseAll,
      expandAll,
      markRecentlyCompleted,
      checkAndPromptParentLog,
      refetch: () => {
        refetch()
      },
      scrollToOffset: (offset: number) => {
        try {
          scrollContainerRef.current?.scrollToOffset?.({ offset, animated: true })
        } catch {
          // Scroll failed
        }
      },
    }),
    [
      allCollapsed,
      allLoadedIds,
      checkAndPromptParentLog,
      collapseAll,
      expandAll,
      markRecentlyCompleted,
      refetch,
    ],
  )

  const renderHabitCard = useCallback(
    (
      habit: NormalizedHabit,
      depth: number,
      hasChildren: boolean,
      hasSubHabits: boolean,
      options?: {
        onLongPressCard?: () => void
        tourTargetId?: string
      },
    ) => {
      const progress = hasChildren
        ? getChildrenProgress(habit.id)
        : { done: 0, total: 0 }

      return (
        <HabitCard
          key={habit.id}
          habit={habit}
          selectedDate={selectedDate}
          isRecentlyCompleted={recentlyCompletedIds.has(habit.id)}
          depth={depth}
          hasChildren={hasChildren}
          hasSubHabits={hasSubHabits}
          tourTargetId={options?.tourTargetId}
          isExpanded={!collapsedIds.has(habit.id)}
          childrenDone={progress.done}
          childrenTotal={progress.total}
          showAddSubHabit
          searchQuery={searchQuery}
          isSelectMode={isSelectMode}
          isSelected={selectedIds.has(habit.id)}
          actions={{
            onLog: () => {
              if (onLogHabit) {
                onLogHabit(habit)
                return
              }
              void handleDirectLog(habit.id)
            },
            onUnlog: () => logMutation.mutate({ habitId: habit.id }),
            onSkip: () => {
              promptSkip(habit.id)
            },
            onToggleExpand: () => toggleExpand(habit.id),
            onDelete: () => {
              promptDelete(habit.id)
            },
            onDuplicate: () => promptDuplicate(habit.id),
            onEdit: () => onEditHabit?.(habit),
            onMoveParent: () => {
              openMoveParentDialog(habit.id)
            },
            onAddSubHabit: () => {
              startAddSubHabit(habit.id)
            },
            onDrillInto: hasSubHabits ? () => { void drill.drillInto(habit.id) } : undefined,
            onForceLogParent: () => {
              promptForceLogParent(habit.id)
            },
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
    },
    [
      selectedDate,
      collapsedIds,
      getChildrenProgress,
      searchQuery,
      isSelectMode,
      selectedIds,
      onLogHabit,
      logMutation,
      promptSkip,
      toggleExpand,
      t,
      promptDelete,
      promptDuplicate,
      openMoveParentDialog,
      startAddSubHabit,
      drill.drillInto,
      toggleSelectMode,
      toggleSelectionCascade,
      getDescendantIds,
      isAncestorSelected,
      onDetailHabit,
      onEditHabit,
    ],
  )

  const renderAllViewChildren = useCallback(
    (parentId: string, depth: number) => {
      if (collapsedIds.has(parentId) || depth >= 3) return null
      const children = getVisibleChildren(parentId)
      if (children.length === 0) return null

      return children.map((child) => {
        const visibleChildren = getVisibleChildren(child.id)
        return (
          <View key={child.id} style={styles.allViewChild}>
            {renderHabitCard(
              child,
              depth,
              visibleChildren.length > 0,
              child.hasSubHabits,
            )}
            {renderAllViewChildren(child.id, depth + 1)}
          </View>
        )
      })
    },
    [collapsedIds, getVisibleChildren, renderHabitCard, styles.allViewChild],
  )

  const renderItem = useCallback(
    ({ item, drag, getIndex }: RenderItemParams<DragItem>) => (
      <View style={styles.sectionInset}>
        {renderHabitCard(item.habit, item.depth, item.hasChildren, item.hasSubHabits, {
          onLongPressCard: isDndEnabled ? () => prepareDrag(item, drag) : undefined,
          tourTargetId: getIndex() === 0 ? 'tour-habit-list' : undefined,
        })}
      </View>
    ),
    [isDndEnabled, prepareDrag, renderHabitCard, styles.sectionInset],
  )

  const keyExtractor = useCallback(
    (item: DragItem) => item.id,
    [],
  )

  const renderEmptyState = useCallback(
    (currentView: 'today' | 'all' | 'general') => (
      <HabitListEmptyState
        title={t(getHabitEmptyStateKey(currentView))}
        description={getEmptyHabitsMessage(currentView, t)}
        actionLabel={currentView === 'all' || currentView === 'general' ? t('habits.createHabit') : undefined}
        onAction={onCreatePress}
        variant="primary"
        styles={styles}
        colors={{ textMuted: colors.textMuted, primary: colors.primary, textSecondary: colors.textSecondary }}
      />
    ),
    [colors.primary, colors.textMuted, colors.textSecondary, onCreatePress, styles, t],
  )

  const listHeaderComponent = useMemo(
    () => (listHeader ? <View style={styles.sectionInset}>{listHeader}</View> : null),
    [listHeader, styles.sectionInset],
  )

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isFetching && !isLoading}
        onRefresh={refetch}
        tintColor={colors.primary}
      />
    ),
    [colors.primary, isFetching, isLoading, refetch],
  )

  const renderGroupSection = useCallback(
    ({ item: group }: { item: HabitListDateGroup }) => (
      <HabitListDateGroupSection
        group={group}
        overdueLabel={t('habits.overdue')}
        styles={styles}
        renderHabit={(habit) => {
          const children = getVisibleChildren(habit.id)
          return (
            <>
              {renderHabitCard(
                habit,
                0,
                children.length > 0,
                habit.hasSubHabits,
              )}
              {renderAllViewChildren(habit.id, 1)}
            </>
          )
        }}
      />
    ),
    [getVisibleChildren, renderAllViewChildren, renderHabitCard, styles, t],
  )

  const renderDrillItem = useCallback(
    ({ item: child }: { item: NormalizedHabit }) => {
      const grandChildren = drill.getDrillChildren(child.id)
      return (
        <View style={styles.sectionInset}>
          {renderHabitCard(
            child,
            0,
            grandChildren.length > 0,
            child.hasSubHabits || grandChildren.length > 0,
          )}
        </View>
      )
    },
    [drill, renderHabitCard, styles.sectionInset],
  )

  const drillFooter = useMemo(
    () => (
      <TouchableOpacity
        style={styles.drillAddBtn}
        onPress={() => {
          const parent =
            drill.currentParentId
              ? (habitsById.get(drill.currentParentId) ?? null)
              : null
          setSubHabitParent(parent)
          setShowSubHabitModal(true)
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.drillAddBtnText}>
          {t('habits.actions.addSubHabit')}
        </Text>
      </TouchableOpacity>
    ),
    [
      drill.currentParentId,
      habitsById,
      styles.drillAddBtn,
      styles.drillAddBtnText,
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

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open)
          if (!open) {
            setHabitToDelete(null)
          }
        }}
        title={t('habits.deleteConfirmTitle')}
        description={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
        variant="danger"
      />

      <ConfirmDialog
        open={showDuplicateConfirm}
        onOpenChange={(open) => {
          setShowDuplicateConfirm(open)
          if (!open) {
            setHabitToDuplicate(null)
          }
        }}
        title={t('habits.duplicateConfirmTitle')}
        description={t('habits.duplicateConfirmMessage', {
          name: habitToDuplicate?.title ?? '',
        })}
        confirmLabel={t('habits.duplicateConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDuplicate}
        onCancel={() => {
          setHabitToDuplicate(null)
          setShowDuplicateConfirm(false)
        }}
        variant="success"
      />

      <ConfirmDialog
        open={showSkipConfirm}
        onOpenChange={setShowSkipConfirm}
        title={t(
          isPostponeAction
            ? 'habits.postponeConfirmTitle'
            : 'habits.skipConfirmTitle',
        )}
        description={skipConfirmMessage}
        confirmLabel={t(
          isPostponeAction
            ? 'habits.postponeConfirmButton'
            : 'habits.skipConfirmButton',
        )}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmSkip}
        onCancel={() => {
          setHabitToSkip(null)
          setShowSkipConfirm(false)
        }}
        variant="warning"
      />

      <ConfirmDialog
        open={showForceLogConfirm}
        onOpenChange={setShowForceLogConfirm}
        title={t('habits.forceLogTitle')}
        description={t('habits.forceLogMessage')}
        confirmLabel={t('habits.forceLogConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmForceLog}
        onCancel={() => {
          setForceLogHabitId(null)
          setShowForceLogConfirm(false)
        }}
        variant="warning"
      />

      <ConfirmDialog
        open={showAutoLogParent}
        onOpenChange={setShowAutoLogParent}
        title={t('habits.autoLogParentTitle')}
        description={t('habits.autoLogParentMessage', { name: autoLogParentHabit?.title ?? '' })}
        confirmLabel={t('habits.autoLogParentConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmAutoLogParent}
        onCancel={() => {
          setAutoLogParentId(null)
          setShowAutoLogParent(false)
        }}
        variant="success"
      />

      <Modal
        visible={showMoveParentDialog}
        transparent
        animationType="fade"
        onRequestClose={closeMoveParentDialog}
      >
        <TouchableOpacity
          style={styles.dialogBackdrop}
          activeOpacity={1}
          onPress={closeMoveParentDialog}
        >
          <View
            style={styles.moveDialog}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.moveDialogTitle}>
              {t('habits.moveParent.title')}
            </Text>
            {movingHabit ? (
              <Text style={styles.moveDialogDescription}>
                {t('habits.moveParent.description', { name: movingHabit.title })}
              </Text>
            ) : null}

            {moveParentOptions.length > 0 ? (
              <ScrollView
                style={styles.moveOptionsList}
                contentContainerStyle={styles.moveOptionsContent}
                showsVerticalScrollIndicator={false}
              >
                {moveParentOptions.map((option) => {
                  const isSelectedOption = option.id === selectedMoveParentId
                  return (
                    <TouchableOpacity
                      key={option.id ?? '__root__'}
                      style={[
                        styles.moveOption,
                        isSelectedOption && styles.moveOptionSelected,
                        option.disabled && styles.moveOptionDisabled,
                        option.id !== null
                          ? { paddingLeft: 12 + option.depth * 18 }
                          : null,
                      ]}
                      disabled={option.disabled}
                      onPress={() => setSelectedMoveParentId(option.id)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.moveOptionHeader}>
                        <Text style={styles.moveOptionLabel} numberOfLines={1}>
                          {option.label}
                        </Text>
                        {option.id === movingHabit?.parentId ? (
                          <Text style={styles.moveOptionCurrent}>
                            {t('habits.moveParent.currentParent')}
                          </Text>
                        ) : null}
                      </View>
                      {option.reason ? (
                        <Text style={styles.moveOptionReason}>
                          {option.reason}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            ) : (
              <Text style={styles.moveDialogEmpty}>
                {t('habits.moveParent.noOptions')}
              </Text>
            )}

            <View style={styles.moveDialogActions}>
              <TouchableOpacity
                style={styles.moveDialogCancel}
                disabled={moveParentMutation.isPending}
                onPress={closeMoveParentDialog}
                activeOpacity={0.75}
              >
                <Text style={styles.moveDialogCancelText}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.moveDialogConfirm,
                  !canSubmitMoveParent && styles.moveDialogConfirmDisabled,
                ]}
                disabled={!canSubmitMoveParent}
                onPress={() => {
                  void confirmMoveParent()
                }}
                activeOpacity={0.8}
              >
                {moveParentMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.moveDialogConfirmText}>
                    {t('habits.moveParent.confirm')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )

  // Drill view: when drilled into a parent, show its sub-habits
  if (drill.currentParentId) {
    const completedCount = drill.drillChildren.filter(
      (c) => c.isCompleted || c.isLoggedInRange,
    ).length

    const drillListHeader = (
      <>
        {listHeaderComponent}
        <View style={styles.drillHeader}>
          <TouchableOpacity
            onPress={drill.drillBack}
            style={styles.drillBackBtn}
            activeOpacity={0.7}
          >
            <ChevronLeft size={20} color={colors.primary} />
            <Text style={styles.drillBackText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.drillTitle} numberOfLines={1}>
              {drill.currentParent?.title ?? ''}
            </Text>
            <Text style={styles.drillProgress}>
              {completedCount}/{drill.drillChildren.length}{' '}
              {t('habits.completed')}
            </Text>
          </View>
          {drill.drillStack.length > 1 ? (
            <TouchableOpacity onPress={drill.drillReset} activeOpacity={0.7}>
              <ChevronLeft size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </>
    )

    const drillEmptyState = drill.drillLoading ? (
      <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
    ) : drill.drillError ? (
      <Text style={styles.emptyText}>{drill.drillError}</Text>
    ) : (
      <Text style={styles.emptyText}>{t('habits.emptyState')}</Text>
    )

    return (
      <>
        <FlatList
          data={drill.drillLoading || drill.drillError ? [] : drill.drillChildren}
          keyExtractor={(item) => item.id}
          renderItem={renderDrillItem}
          ListHeaderComponent={drillListHeader}
          ListEmptyComponent={drillEmptyState}
          ListFooterComponent={drillFooter}
          contentContainerStyle={[
            styles.listContent,
            isSelectMode ? styles.listContentWithBulkBar : null,
          ]}
          refreshControl={refreshControl}
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

  // Loading skeleton (matches web: 3 skeleton cards)
  if (isLoading) {
    return (
      <>
        <FlatList
          data={['skeleton-1', 'skeleton-2', 'skeleton-3']}
          keyExtractor={(item) => item}
          renderItem={() => (
            <View style={styles.sectionInset}>
              <SkeletonCard styles={styles} />
            </View>
          )}
          ListHeaderComponent={listHeaderComponent}
          contentContainerStyle={[
            styles.skeletonContainer,
            isSelectMode ? styles.listContentWithBulkBar : null,
          ]}
          refreshControl={refreshControl}
          onScrollBeginDrag={onScrollBeginDrag}
          showsVerticalScrollIndicator={false}
        />
        {commonOverlays}
      </>
    )
  }

  // All done today empty state
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
              <View style={styles.emptyAllDone}>
                <View style={styles.allDoneIconContainer}>
                  <CheckCircle2 size={40} color={colors.success} />
                </View>
                <Text style={styles.allDoneTitle}>
                  {t('habits.allDoneToday')}
                </Text>
                <Text style={styles.allDoneSubtitle}>
                  {t('habits.allDoneHint')}
                </Text>
                {onSeeUpcoming ? (
                  <TouchableOpacity
                    style={styles.seeUpcomingButton}
                    onPress={onSeeUpcoming}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.seeUpcomingText}>
                      {t('habits.seeUpcoming')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            isSelectMode ? styles.listContentWithBulkBar : null,
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
          data={dateGroups}
          keyExtractor={(item) => item.key}
          renderItem={renderGroupSection}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={renderEmptyState('all')}
          contentContainerStyle={[
            styles.groupedList,
            isSelectMode ? styles.listContentWithBulkBar : null,
          ]}
          refreshControl={refreshControl}
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
          isSelectMode ? styles.listContentWithBulkBar : null,
        ]}
        refreshControl={refreshControl}
        onDragEnd={handleDragEnd}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={renderEmptyState(view)}
        onScroll={onTourScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={onScrollBeginDrag}
        showsVerticalScrollIndicator={false}
      />
      {commonOverlays}
    </>
  )
})

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function alpha(color: string, opacity: number): string {
  const normalized = color.trim()

  if (normalized.startsWith('rgba(')) {
    const channels = normalized.slice(5, -1).split(',').slice(0, 3).join(',').trim()
    return `rgba(${channels}, ${opacity})`
  }

  if (normalized.startsWith('rgb(')) {
    const channels = normalized.slice(4, -1).trim()
    return `rgba(${channels}, ${opacity})`
  }

  const hex = normalized.replace('#', '')
  if (hex.length !== 6) {
    return normalized
  }

  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Skeleton loading (matches web skeleton)
    skeletonContainer: {
      paddingTop: 8,
      paddingBottom: 100,
      gap: 12,
    },
    skeletonCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    skeletonCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
    },
    skeletonContent: {
      flex: 1,
      gap: 10,
    },
    skeletonTitle: {
      height: 16,
      width: '75%',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 8,
    },
    skeletonSubtitle: {
      height: 12,
      width: '40%',
      backgroundColor: alpha(colors.surfaceElevated, 0.6),
      borderRadius: 8,
    },

    // List
    sectionInset: {
      paddingHorizontal: 20,
    },
    listContent: {
      paddingBottom: 100,
    },
    listContentWithBulkBar: {
      paddingBottom: 220,
    },
    groupedList: {
      paddingBottom: 100,
    },
    groupSection: {
      marginBottom: 16,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      marginBottom: 8,
    },
    groupLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textMuted,
    },
    groupLabelOverdue: {
      color: colors.red400,
    },
    groupDivider: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    groupDividerOverdue: {
      backgroundColor: alpha(colors.red400, 0.2),
    },
    groupItems: {
      gap: 10,
    },
    groupItem: {
      gap: 6,
    },
    allViewChild: {
      gap: 6,
    },
    generalSection: {
      marginTop: 24,
      marginBottom: 16,
    },
    generalSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    generalSectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.primary,
      opacity: 0.7,
    },
    generalSectionDivider: {
      flex: 1,
      height: 1,
      backgroundColor: colors.primary_20,
    },
    generalSectionList: {
      gap: 10,
    },
    emptyContainer: {
      flex: 1,
    },

    // Empty: all done today (matches web allDoneToday state)
    emptyAllDone: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    allDoneIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.emeraldBg,
      borderWidth: 1,
      borderColor: colors.emerald500_20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    allDoneTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    allDoneSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    seeUpcomingButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary_10,
      borderWidth: 1,
      borderColor: colors.primary_20,
    },
    seeUpcomingText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },

    // Empty: no habits (matches web no habits state)
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.surfaceGround,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    createButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    },
    createButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    dialogBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    moveDialog: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '75%',
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: 20,
      padding: 20,
    },
    moveDialogTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    moveDialogDescription: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 16,
    },
    moveOptionsList: {
      flexGrow: 0,
    },
    moveOptionsContent: {
      gap: 10,
      paddingBottom: 8,
    },
    moveOption: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    moveOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary_10,
    },
    moveOptionDisabled: {
      opacity: 0.5,
    },
    moveOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    moveOptionLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    moveOptionCurrent: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    moveOptionReason: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 6,
    },
    moveDialogEmpty: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 16,
    },
    moveDialogActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    moveDialogCancel: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
    },
    moveDialogCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    moveDialogConfirm: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      minHeight: 46,
    },
    moveDialogConfirmDisabled: {
      opacity: 0.5,
    },
    moveDialogConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },

    // Drill navigation
    drillHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderMuted,
      marginBottom: 8,
    },
    drillBackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingRight: 8,
    },
    drillBackText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    drillTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    drillProgress: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    drillAddBtn: {
      marginHorizontal: 16,
      marginVertical: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
    },
    drillAddBtnText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 32,
      paddingHorizontal: 24,
    },
  })
}
