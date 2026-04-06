import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
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

  const renderItem = useCallback(
    ({ item }: { item: Goal }) => <GoalCard goal={item} onPress={handleGoalPress} />,
    [handleGoalPress],
  )

  const keyExtractor = useCallback((item: Goal) => item.id, [])

  return (
    <View style={styles.container}>
      <FlatList
        data={goals}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

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
    paddingBottom: 100,
  },
})
