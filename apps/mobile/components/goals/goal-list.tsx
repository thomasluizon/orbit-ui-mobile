import { useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Target, Plus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@orbit/shared/types/goal'
import { useGoals } from '@/hooks/use-goals'
import { GoalCard } from '@/components/goal-card'
import { GoalDetailDrawer } from './goal-detail-drawer'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalListProps {
  onCreatePress: () => void
}

// ---------------------------------------------------------------------------
// Skeleton card for loading state
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonBar} />
      <View style={styles.skeletonFooter}>
        <View style={styles.skeletonPercent} />
        <View style={styles.skeletonBadge} />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalList({ onCreatePress }: GoalListProps) {
  const { t } = useTranslation()
  const { data: goalsData, isLoading, isFetching, refetch } = useGoals()
  const goals = goalsData?.allGoals ?? []

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const handleGoalPress = useCallback((goalId: string) => {
    setSelectedGoalId(goalId)
    setShowDetail(true)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false)
    setSelectedGoalId(null)
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: Goal }) => (
      <GoalCard goal={item} onPress={handleGoalPress} />
    ),
    [handleGoalPress],
  )

  const keyExtractor = useCallback((item: Goal) => item.id, [])

  // Loading skeleton
  if (isLoading) {
    return (
      <View style={styles.skeletonContainer}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    )
  }

  return (
    <>
      <FlatList
        data={goals}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={
          goals.length === 0 ? styles.emptyContainer : styles.listContent
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
              <Target size={40} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t('goals.empty')}</Text>
            <Text style={styles.emptySubtitle}>{t('goals.emptyHint')}</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={onCreatePress}
              activeOpacity={0.8}
            >
              <Plus size={18} color={colors.white} />
              <Text style={styles.createButtonText}>
                {t('goals.create')}
              </Text>
            </TouchableOpacity>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {selectedGoalId && (
        <GoalDetailDrawer
          open={showDetail}
          onClose={handleCloseDetail}
          goalId={selectedGoalId}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Skeleton
  skeletonContainer: {
    paddingTop: 8,
    gap: 12,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
  skeletonTitle: {
    height: 16,
    width: '60%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
  },
  skeletonBar: {
    height: 8,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 9999,
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonPercent: {
    height: 12,
    width: '25%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
  },
  skeletonBadge: {
    height: 12,
    width: '20%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
  },

  // List
  listContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },

  // Empty state
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.lg,
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
