import { useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { Plus } from 'lucide-react-native'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import { useHabits, useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { HabitCard } from './habit-card'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitListProps {
  filters: HabitsFilter
  dateStr: string
  showCompleted: boolean
  onCreatePress: () => void
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  primary: '#8b5cf6',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
  surface: '#13111f',
}

// ---------------------------------------------------------------------------
// HabitList
// ---------------------------------------------------------------------------

export function HabitList({
  filters,
  dateStr,
  showCompleted,
  onCreatePress,
}: HabitListProps) {
  const habitsQuery = useHabits(filters)
  const topLevelHabits = habitsQuery.data?.topLevelHabits ?? []
  const isLoading = habitsQuery.isLoading
  const isFetching = habitsQuery.isFetching
  const refetch = habitsQuery.refetch

  const logMutation = useLogHabit()
  const skipMutation = useSkipHabit()

  // Filter out completed habits if needed
  const visibleHabits = showCompleted
    ? topLevelHabits
    : topLevelHabits.filter((h) => !h.isCompleted)

  const handleLog = useCallback(
    (habitId: string) => {
      logMutation.mutate({ habitId })
    },
    [logMutation],
  )

  const handleSkip = useCallback(
    (habitId: string) => {
      skipMutation.mutate({ habitId })
    },
    [skipMutation],
  )

  const renderItem = useCallback(
    ({ item }: { item: NormalizedHabit }) => (
      <HabitCard
        habit={item}
        dateStr={dateStr}
        isLogged={item.isCompleted}
        onLog={handleLog}
        onSkip={handleSkip}
      />
    ),
    [dateStr, handleLog, handleSkip],
  )

  const keyExtractor = useCallback(
    (item: NormalizedHabit) => item.id,
    [],
  )

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <FlatList
      data={visibleHabits}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={
        visibleHabits.length === 0 ? styles.emptyContainer : styles.listContent
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
          <Text style={styles.emptyTitle}>No habits yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first habit to get started
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={onCreatePress}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.emptyButtonText}>Create Habit</Text>
          </TouchableOpacity>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
})
