import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
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
import {
  format,
  isBefore,
  isToday as isDateToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ClipboardList,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  getHabitEmptyStateKey,
} from '@orbit/shared/utils'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import {
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useMoveHabitParent,
} from '@/hooks/use-habits'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { getHabitListExtraData } from '@/lib/habit-selection-state'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { HabitCard } from './habit-card'

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
  scrollEnabled?: boolean
  onCreatePress: () => void
  onSeeUpcoming?: () => void
  onLogHabit?: (habit: NormalizedHabit) => void
  onDetailHabit?: (habit: NormalizedHabit) => void
}

export interface HabitListHandle {
  allCollapsed: boolean
  allLoadedIds: Set<string>
  collapseAll: () => void
  expandAll: () => void
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  refetch: () => void
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

interface DateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

interface MoveParentOption {
  id: string | null
  label: string
  depth: number
  disabled: boolean
  reason: string | null
}

function formatDateGroupLabel(
  key: string,
  locale: string,
  t: (key: string) => string,
): string {
  if (!key) return t('common.unknown')

  const date = new Date(`${key}T00:00:00`)
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const todayDate = startOfDay(new Date())

  if (isDateToday(date)) return t('dates.today')
  if (isTomorrow(date)) return t('dates.tomorrow')
  if (isYesterday(date)) return t('dates.yesterday')

  if (isBefore(date, todayDate)) {
    return format(date, locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM dd, yyyy', {
      locale: dateFnsLocale,
    })
  }

  return format(
    date,
    locale === 'pt-BR' ? "EEEE, dd 'de' MMM" : 'EEEE, MMM dd',
    { locale: dateFnsLocale },
  )
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
    scrollEnabled = true,
    onCreatePress,
    onSeeUpcoming,
    onLogHabit,
    onDetailHabit,
  },
  ref,
) {
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { config: appConfig } = useConfig()
  const maxHabitDepth = appConfig.limits.maxHabitDepth
  const habitsQuery = useHabits(filters)
  const habitsById = useMemo(
    () => habitsQuery.data?.habitsById ?? new Map<string, NormalizedHabit>(),
    [habitsQuery.data?.habitsById],
  )
  const topLevelHabits = useMemo(
    () => habitsQuery.data?.topLevelHabits ?? [],
    [habitsQuery.data?.topLevelHabits],
  )
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
  const moveParentMutation = useMoveHabitParent()
  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)

  // Collapse state
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<Set<string>>(new Set())
  const [showAutoLogParent, setShowAutoLogParent] = useState(false)
  const [autoLogParentId, setAutoLogParentId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
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
    setRecentlyCompletedIds((previous) => new Set(previous).add(habitId))
    setTimeout(() => {
      setRecentlyCompletedIds((previous) => {
        const next = new Set(previous)
        next.delete(habitId)
        return next
      })
    }, 1400)
  }, [])

  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] => visibility.getVisibleChildren(parentId, view),
    [view, visibility],
  )

  const visibleHabits = useMemo(() => {
    if (view === 'today') {
      const todayHabits = topLevelHabits.filter((habit) => !habit.isGeneral)
      if (showCompleted) return todayHabits
      return todayHabits.filter((habit) => visibility.hasVisibleContent(habit))
    }

    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter(
      (habit) => !habit.isCompleted || recentlyCompletedIds.has(habit.id),
    )
  }, [recentlyCompletedIds, showCompleted, topLevelHabits, view, visibility])

  const generalHabits = useMemo(() => {
    if (view !== 'today') return []
    return topLevelHabits.filter((habit) => habit.isGeneral)
  }, [topLevelHabits, view])

  const dateGroups = useMemo<DateGroup[]>(() => {
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

    const result: DateGroup[] = []

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
        label: formatDateGroupLabel(key, i18n.language, t),
        isOverdue: false,
        habits,
      })
    }

    return result
  }, [i18n.language, t, view, visibleHabits])

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

  // Build flat drag items (tree flattening with depth)
  interface DragItem {
    id: string
    habit: NormalizedHabit
    depth: number
    hasChildren: boolean
    hasSubHabits: boolean
  }

  const flatItems = useMemo<DragItem[]>(() => {
    const items: DragItem[] = []

    function addHabitTree(habit: NormalizedHabit, depth: number) {
      const children = getVisibleChildren(habit.id)
      items.push({
        id: habit.id,
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

  // Children progress
  const getChildrenProgress = useCallback(
    (habitId: string) => {
      const children = getChildren(habitId)
      let done = 0
      let total = 0
      for (const child of children) {
        total++
        if (child.isCompleted || child.isLoggedInRange) done++
        const nested = getChildren(child.id)
        for (const nc of nested) {
          total++
          if (nc.isCompleted || nc.isLoggedInRange) done++
        }
      }
      return { done, total }
    },
    [getChildren],
  )

  const checkAndPromptParentLog = useCallback((childHabitId: string) => {
    const childHabit = habitsById.get(childHabitId)
    if (!childHabit?.parentId) return

    const parentHabit = habitsById.get(childHabit.parentId)
    if (!parentHabit || parentHabit.isCompleted) return

    const progress = getChildrenProgress(parentHabit.id)
    if (progress.total > 0 && progress.done >= progress.total) {
      setAutoLogParentId(parentHabit.id)
      setShowAutoLogParent(true)
    }
  }, [getChildrenProgress, habitsById])

  const confirmAutoLogParent = useCallback(async () => {
    const parentId = autoLogParentId
    if (!parentId) return

    setShowAutoLogParent(false)
    setAutoLogParentId(null)
    markRecentlyCompleted(parentId)

    try {
      await logMutation.mutateAsync({ habitId: parentId })
      checkAndPromptParentLog(parentId)
    } catch {
      // Error handled by mutation
    }
  }, [autoLogParentId, checkAndPromptParentLog, logMutation, markRecentlyCompleted])

  const handleSkip = useCallback(async (habitId: string) => {
    try {
      await skipMutation.mutateAsync({ habitId })
      markRecentlyCompleted(habitId)
      checkAndPromptParentLog(habitId)
    } catch {
      // Error handled by mutation
    }
  }, [checkAndPromptParentLog, markRecentlyCompleted, skipMutation])

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
    const parentHabitCandidate = habitsById.get(parentId)
    if (!parentHabitCandidate) return

    if (collapsedIds.has(parentId)) {
      toggleExpand(parentId)
    }

    setSubHabitParent(parentHabitCandidate)
    setShowSubHabitModal(true)
  }, [collapsedIds, habitsById, toggleExpand])

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
    ) => {
      const progress = hasChildren
        ? getChildrenProgress(habit.id)
        : { done: 0, total: 0 }

      return (
        <HabitCard
          key={habit.id}
          habit={habit}
          selectedDate={selectedDate}
          depth={depth}
          hasChildren={hasChildren}
          hasSubHabits={hasSubHabits}
          isExpanded={!collapsedIds.has(habit.id)}
          childrenDone={progress.done}
          childrenTotal={progress.total}
          showAddSubHabit
          searchQuery={searchQuery}
          isSelectMode={isSelectMode}
          isSelected={selectedIds.has(habit.id)}
          onLog={() => {
            if (onLogHabit) {
              onLogHabit(habit)
              return
            }
            logMutation.mutate({ habitId: habit.id })
          }}
          onUnlog={() => logMutation.mutate({ habitId: habit.id })}
          onSkip={() => {
            void handleSkip(habit.id)
          }}
          onToggleExpand={() => toggleExpand(habit.id)}
          onDelete={() => {
            promptDelete(habit.id)
          }}
          onDuplicate={() => duplicateMutation.mutate(habit.id)}
          onMoveParent={() => {
            openMoveParentDialog(habit.id)
          }}
          onAddSubHabit={() => {
            startAddSubHabit(habit.id)
          }}
          onDrillInto={hasSubHabits ? () => { void drill.drillInto(habit.id) } : undefined}
          onForceLogParent={() => {
            if (onLogHabit) {
              onLogHabit(habit)
            } else {
              logMutation.mutate({ habitId: habit.id })
            }
          }}
          onEnterSelectMode={() => {
            if (!isSelectMode) toggleSelectMode()
            toggleSelectionCascade(
              habit.id,
              getDescendantIds,
              isAncestorSelected,
            )
          }}
          onDetail={() => onDetailHabit?.(habit)}
          onToggleSelection={() =>
            toggleSelectionCascade(
              habit.id,
              getDescendantIds,
              isAncestorSelected,
            )
          }
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
      handleSkip,
      toggleExpand,
      t,
      promptDelete,
      duplicateMutation,
      openMoveParentDialog,
      startAddSubHabit,
      drill.drillInto,
      toggleSelectMode,
      toggleSelectionCascade,
      getDescendantIds,
      isAncestorSelected,
      onDetailHabit,
    ],
  )

  const generalHabitSection = useMemo(() => {
    if (view !== 'today' || generalHabits.length === 0) return null

    return (
      <View style={styles.generalSection}>
        <View style={styles.generalSectionHeader}>
          <Text style={styles.generalSectionLabel}>{t('habits.generalSection')}</Text>
          <View style={styles.generalSectionDivider} />
        </View>
        <View style={styles.generalSectionList}>
          {generalHabits.map((habit) => renderHabitCard(habit, 0, false, false))}
        </View>
      </View>
    )
  }, [generalHabits, renderHabitCard, styles, t, view])

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
    ({ item }: { item: DragItem }) =>
      renderHabitCard(item.habit, item.depth, item.hasChildren, item.hasSubHabits),
    [renderHabitCard],
  )

  const keyExtractor = useCallback(
    (item: DragItem) => item.id,
    [],
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
        open={showAutoLogParent}
        onOpenChange={setShowAutoLogParent}
        title={t('habits.autoLogParentTitle')}
        description={t('habits.autoLogParentMessage', { name: autoLogParentHabit?.title ?? '' })}
        confirmLabel={t('habits.autoLogParentConfirm')}
        onConfirm={confirmAutoLogParent}
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

    return (
      <View style={{ flex: 1 }}>
        {/* Drill header */}
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
          {drill.drillStack.length > 1 && (
            <TouchableOpacity onPress={drill.drillReset} activeOpacity={0.7}>
              <ChevronLeft size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {drill.drillLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : drill.drillError ? (
          <Text style={styles.emptyText}>{drill.drillError}</Text>
        ) : drill.drillChildren.length === 0 ? (
          <Text style={styles.emptyText}>{t('habits.emptyState')}</Text>
        ) : (
          <FlatList
            data={drill.drillChildren}
            keyExtractor={(item) => item.id}
            renderItem={({ item: child }) => {
              const grandChildren = drill.getDrillChildren(child.id)
              return renderHabitCard(
                child,
                0,
                grandChildren.length > 0,
                child.hasSubHabits || grandChildren.length > 0,
              )
            }}
            contentContainerStyle={styles.listContent}
            scrollEnabled={scrollEnabled}
          />
        )}

        {/* Add sub-habit button */}
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

        {commonOverlays}
      </View>
    )
  }

  // Loading skeleton (matches web: 3 skeleton cards)
  if (isLoading) {
    return (
      <View style={styles.skeletonContainer}>
        <SkeletonCard styles={styles} />
        <SkeletonCard styles={styles} />
        <SkeletonCard styles={styles} />
      </View>
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
        <View>
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
            {onSeeUpcoming && (
              <TouchableOpacity
                style={styles.seeUpcomingButton}
                onPress={onSeeUpcoming}
                activeOpacity={0.8}
              >
                <Text style={styles.seeUpcomingText}>
                  {t('habits.seeUpcoming')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {generalHabitSection}
        </View>
        {commonOverlays}
      </>
    )
  }

  if (view === 'all' && visibleHabits.length > 0) {
    return (
      <>
        <View style={styles.groupedList}>
          {dateGroups.map((group) => (
            <View key={group.key} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <Text
                  style={[
                    styles.groupLabel,
                    group.isOverdue ? styles.groupLabelOverdue : null,
                  ]}
                >
                  {group.isOverdue ? t('habits.overdue') : group.label}
                </Text>
                <View
                  style={[
                    styles.groupDivider,
                    group.isOverdue ? styles.groupDividerOverdue : null,
                  ]}
                />
              </View>
              <View style={styles.groupItems}>
                {group.habits.map((habit) => {
                  const children = getVisibleChildren(habit.id)
                  return (
                    <View key={habit.id} style={styles.groupItem}>
                      {renderHabitCard(
                        habit,
                        0,
                        children.length > 0,
                        habit.hasSubHabits,
                      )}
                      {renderAllViewChildren(habit.id, 1)}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
        {commonOverlays}
      </>
    )
  }

  return (
    <>
      <FlatList
        data={flatItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={listExtraData}
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled
        contentContainerStyle={
          flatItems.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <ClipboardList size={40} color={colors.textMuted} />
            </View>
            <Text style={styles.emptySubtitle}>
              {getEmptyHabitsMessage(view, t)}
            </Text>
            {(view === 'all' || view === 'general') ? (
              <TouchableOpacity
                style={styles.createButton}
                onPress={onCreatePress}
                activeOpacity={0.8}
              >
                <Text style={styles.createButtonText}>
                  {t('habits.createHabit')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListFooterComponent={generalHabitSection}
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
    listContent: {
      paddingBottom: 100,
    },
    groupedList: {
      paddingBottom: 100,
      gap: 16,
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
