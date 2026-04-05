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
  Alert,
} from 'react-native'
import {
  Plus,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import {
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useMoveHabitParent,
} from '@/hooks/use-habits'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { HabitCard } from './habit-card'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitListProps {
  filters: HabitsFilter
  dateStr: string
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

// ---------------------------------------------------------------------------
// HabitList
// ---------------------------------------------------------------------------

export const HabitList = forwardRef<HabitListHandle, HabitListProps>(function HabitList(
  {
    filters,
    dateStr,
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
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? new Map<string, NormalizedHabit>()
  const topLevelHabits = habitsQuery.data?.topLevelHabits ?? []
  const totalCount = habitsQuery.data?.totalCount ?? 0
  const isLoading = habitsQuery.isLoading
  const isFetching = habitsQuery.isFetching
  const refetch = habitsQuery.refetch
  const getChildren = habitsQuery.getChildren

  const logMutation = useLogHabit()
  const skipMutation = useSkipHabit()
  const deleteMutation = useDeleteHabit()
  const duplicateMutation = useDuplicateHabit()
  const moveParentMutation = useMoveHabitParent()
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)

  // Collapse state
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())
  const selectedIds = selectedHabitIds ?? new Set<string>()

  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      const descendantIds: string[] = []
      const stack: string[] = [parentId]

      while (stack.length > 0) {
        const currentId = stack.pop()
        if (!currentId) continue

        const children = getChildren(currentId)
        for (const child of children) {
          descendantIds.push(child.id)
          stack.push(child.id)
        }
      }

      return descendantIds
    },
    [getChildren],
  )

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

  const allLoadedIds = useMemo(() => {
    const ids = new Set<string>()

    const visit = (habit: NormalizedHabit) => {
      ids.add(habit.id)
      for (const child of getChildren(habit.id)) {
        visit(child)
      }
    }

    for (const habit of topLevelHabits) {
      visit(habit)
    }

    return ids
  }, [getChildren, topLevelHabits])

  const expandableIds = useMemo(() => {
    const ids: string[] = []

    const visit = (habit: NormalizedHabit) => {
      const children = getChildren(habit.id)
      if (children.length > 0) {
        ids.push(habit.id)
        for (const child of children) {
          visit(child)
        }
      }
    }

    for (const habit of topLevelHabits) {
      visit(habit)
    }

    return ids
  }, [getChildren, topLevelHabits])

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

  useImperativeHandle(
    ref,
    () => ({
      allCollapsed,
      allLoadedIds,
      collapseAll,
      expandAll,
      refetch: () => {
        refetch()
      },
    }),
    [allCollapsed, allLoadedIds, collapseAll, expandAll, refetch],
  )

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

  // Filter habits
  const visibleHabits = useMemo(() => {
    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter((h) => !h.isCompleted)
  }, [topLevelHabits, showCompleted])

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
      const children = getChildren(habit.id)
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
  }, [visibleHabits, collapsedIds, getChildren])

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

  const renderItem = useCallback(
    ({ item }: { item: DragItem }) => {
      const progress = item.hasChildren
        ? getChildrenProgress(item.habit.id)
        : { done: 0, total: 0 }

      return (
        <HabitCard
          habit={item.habit}
          selectedDate={selectedDate}
          depth={item.depth}
          hasChildren={item.hasChildren}
          hasSubHabits={item.hasSubHabits}
          isExpanded={!collapsedIds.has(item.habit.id)}
          childrenDone={progress.done}
          childrenTotal={progress.total}
          showAddSubHabit
          searchQuery={searchQuery}
          isSelectMode={isSelectMode}
          isSelected={selectedIds.has(item.habit.id)}
          onLog={() => logMutation.mutate({ habitId: item.habit.id })}
          onUnlog={() => logMutation.mutate({ habitId: item.habit.id })}
          onSkip={() => skipMutation.mutate({ habitId: item.habit.id })}
          onToggleExpand={() => toggleExpand(item.habit.id)}
          onDelete={() => {
            Alert.alert(
              t('common.confirm'),
              t('habits.actions.deleteConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => deleteMutation.mutate(item.habit.id),
                },
              ],
            )
          }}
          onDuplicate={() => duplicateMutation.mutate(item.habit.id)}
          onMoveParent={() => {
            moveParentMutation.mutate({
              habitId: item.habit.id,
              data: { parentId: null },
            })
          }}
          onForceLogParent={() => logMutation.mutate({ habitId: item.habit.id })}
          onEnterSelectMode={() => {
            if (!isSelectMode) toggleSelectMode()
            toggleSelectionCascade(
              item.habit.id,
              getDescendantIds,
              isAncestorSelected,
            )
          }}
          onDetail={() => onDetailHabit?.(item.habit)}
          onToggleSelection={() =>
            toggleSelectionCascade(
              item.habit.id,
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
      logMutation,
      skipMutation,
      deleteMutation,
      duplicateMutation,
      moveParentMutation,
      toggleExpand,
      toggleSelectMode,
      toggleSelectionCascade,
      getDescendantIds,
      isAncestorSelected,
      searchQuery,
      isSelectMode,
      selectedIds,
      onDetailHabit,
      t,
    ],
  )

  const keyExtractor = useCallback(
    (item: DragItem) => item.id,
    [],
  )

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
    !showCompleted
  ) {
    return (
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
    )
  }

  return (
    <FlatList
      data={flatItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
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
            {t('habits.noHabitsYet')}
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={onCreatePress}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>
              {t('habits.createHabit')}
            </Text>
          </TouchableOpacity>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
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
  })
}
