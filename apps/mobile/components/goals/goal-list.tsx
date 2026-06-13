import { forwardRef, useCallback, useState } from 'react'
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import type { Goal } from '@orbit/shared/types/goal'
import { GoalCard } from '@/components/goal-card'
import { GoalDetailDrawer } from './goal-detail-drawer'

interface GoalListProps {
  goals: Goal[]
  ListHeaderComponent?: React.ComponentProps<typeof FlatList>['ListHeaderComponent']
  ListEmptyComponent?: React.ComponentProps<typeof FlatList>['ListEmptyComponent']
  contentContainerStyle?: StyleProp<ViewStyle>
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}

export const GoalList = forwardRef<FlatList<Goal>, Readonly<GoalListProps>>(
  function GoalList(
    {
      goals,
      ListHeaderComponent,
      ListEmptyComponent,
      contentContainerStyle,
      onScroll,
      onScrollBeginDrag,
    },
    ref,
  ) {
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
      ({ item, index }: { item: Goal; index: number }) => (
        <Animated.View
          entering={
            index < 8
              ? FadeInDown.duration(280)
                  .delay(index * 40)
                  .reduceMotion(ReduceMotion.System)
              : undefined
          }
        >
          <GoalCard
            goal={item}
            onPress={handleGoalPress}
            tourTargetId={index === 0 ? 'tour-goal-card' : undefined}
          />
        </Animated.View>
      ),
      [handleGoalPress],
    )

    return (
      <View style={styles.container}>
        <FlatList
          ref={ref}
          data={goals}
          keyExtractor={(goal) => goal.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          contentContainerStyle={[styles.listContent, contentContainerStyle]}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          scrollEventThrottle={16}
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
  },
)

function ItemSeparator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  separator: {
    height: 12,
  },
})
