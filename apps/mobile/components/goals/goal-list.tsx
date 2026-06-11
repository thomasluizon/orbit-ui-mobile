import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
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
          <Animated.View
            key={goal.id}
            entering={
              index < 8
                ? FadeInDown.duration(280)
                    .delay(index * 40)
                    .reduceMotion(ReduceMotion.System)
                : undefined
            }
          >
            <GoalCard
              goal={goal}
              onPress={handleGoalPress}
              tourTargetId={index === 0 ? 'tour-goal-card' : undefined}
            />
          </Animated.View>
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
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
})
