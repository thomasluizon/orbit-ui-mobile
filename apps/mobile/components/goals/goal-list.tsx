import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { Goal } from '@orbit/shared/types/goal'
import { GoalCard } from '@/components/goal-card'
import { GoalDetailDrawer } from './goal-detail-drawer'

interface GoalListProps {
  goals: Goal[]
}

export function GoalList({ goals }: Readonly<GoalListProps>) {
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

  return (
    <View style={styles.container}>
      <View style={styles.listContent}>
        {goals.map((goal, index) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onPress={handleGoalPress}
            tourTargetId={index === 0 ? 'tour-goal-card' : undefined}
          />
        ))}
      </View>

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
    flex: 1,
  },
  listContent: {
    gap: 12,
    paddingBottom: 100,
  },
})
