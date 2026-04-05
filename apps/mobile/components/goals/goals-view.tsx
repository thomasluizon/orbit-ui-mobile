import { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Target } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Goal, GoalStatus } from '@orbit/shared/types/goal'
import { useGoals } from '@/hooks/use-goals'
import { GoalCard } from '@/components/goal-card'
import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'
import { colors, radius } from '@/lib/theme'

interface StatusFilter {
  key: GoalStatus | null
  label: string
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonBody} />
      <View style={styles.skeletonBar} />
    </View>
  )
}

export function GoalsView() {
  const { t } = useTranslation()
  const [activeFilter, setActiveFilter] = useState<GoalStatus | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const { data, isFetched, isFetching, refetch } = useGoals(activeFilter)

  const statusFilters = useMemo<StatusFilter[]>(
    () => [
      { key: null, label: t('goals.filters.all') },
      { key: 'Active', label: t('goals.filters.active') },
      { key: 'Completed', label: t('goals.filters.completed') },
      { key: 'Abandoned', label: t('goals.filters.abandoned') },
    ],
    [t],
  )

  const filteredGoals = useMemo(() => {
    if (!data) return []
    if (!activeFilter) return data.allGoals
    return data.allGoals.filter((goal) => goal.status === activeFilter)
  }, [activeFilter, data])

  const handleFilterChange = useCallback((status: GoalStatus | null) => {
    setActiveFilter(status)
  }, [])

  const handleGoalPress = useCallback((goalId: string) => {
    setSelectedGoalId(goalId)
    setShowDetail(true)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false)
    setSelectedGoalId(null)
  }, [])

  const renderGoal = useCallback(
    ({ item }: { item: Goal }) => (
      <GoalCard goal={item} onPress={handleGoalPress} />
    ),
    [handleGoalPress],
  )

  const keyExtractor = useCallback((item: Goal) => item.id, [])

  return (
    <View style={styles.container}>
      <View style={styles.filtersRow}>
        {statusFilters.map((filter) => {
          const active = activeFilter === filter.key
          return (
            <TouchableOpacity
              key={filter.key ?? 'all'}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => handleFilterChange(filter.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {!isFetched ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filteredGoals.length > 0 ? (
        <FlatList
          data={filteredGoals}
          renderItem={renderGoal}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={(
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Target size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t('goals.empty')}</Text>
          <Text style={styles.emptySubtitle}>{t('goals.emptyHint')}</Text>
        </View>
      )}

      {selectedGoalId ? (
        <GoalDetailDrawer
          open={showDetail}
          onClose={handleCloseDetail}
          goalId={selectedGoalId}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textFaded,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  skeletonContainer: {
    gap: 12,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    gap: 10,
  },
  skeletonTitle: {
    height: 20,
    width: '66%',
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  skeletonBody: {
    height: 12,
    width: '100%',
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  skeletonBar: {
    height: 8,
    width: '100%',
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceGround,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
})
