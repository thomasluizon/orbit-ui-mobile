import { forwardRef, useCallback, useState } from 'react'
import {
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import type { FlatList } from 'react-native-gesture-handler'
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'
import { GoalCard } from '@/components/goal-card'
import { useReorderGoals } from '@/hooks/use-goals'
import { GoalDetailDrawer } from './goal-detail-drawer'

interface GoalListProps {
  goals: Goal[]
  ListHeaderComponent?: Exclude<FlatListProps<Goal>['ListHeaderComponent'], undefined>
  ListEmptyComponent?: Exclude<FlatListProps<Goal>['ListEmptyComponent'], undefined>
  contentContainerStyle?: StyleProp<ViewStyle>
  onScroll?: (offsetY: number) => void
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
    const reorderGoals = useReorderGoals()
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
    const [showDetail, setShowDetail] = useState(false)

    const handleGoalPress = useCallback((goalId: string) => {
      setSelectedGoalId(goalId)
      setShowDetail(true)
    }, [])

    /* WHY: selectedGoalId stays set on close - unmounting the drawer here tears
       down its presented TrueSheet mid-dismissal, which wedges every later RN
       Modal and drops the onDidDismiss that runs the scheduled exit action.
       https://sheet.lodev09.com/guides/navigation */
    const handleCloseDetail = useCallback(() => {
      setShowDetail(false)
    }, [])

    const handleDragEnd = useCallback(
      ({ data }: DragEndParams<Goal>) => {
        const positions: GoalPositionItem[] = data.map((goal, index) => ({
          id: goal.id,
          position: index,
        }))
        reorderGoals.mutate(positions)
      },
      [reorderGoals],
    )

    const renderItem = useCallback(
      ({ item, getIndex, drag }: RenderItemParams<Goal>) => {
        const index = getIndex() ?? 0
        return (
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
              onLongPress={drag}
              tourTargetId={index === 0 ? 'tour-goal-card' : undefined}
            />
          </Animated.View>
        )
      },
      [handleGoalPress],
    )

    return (
      <View style={styles.container}>
        <DraggableFlatList
          ref={ref}
          data={goals}
          keyExtractor={(goal) => goal.id}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          contentContainerStyle={[styles.listContent, contentContainerStyle]}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          // WHY: DraggableFlatList overwrites any caller onScroll with its own reanimated handler; onScrollOffsetChange is its supported scroll-offset API https://github.com/computerjazz/react-native-draggable-flatlist/blob/v4.0.3/src/components/DraggableFlatList.tsx#L396
          onScrollOffsetChange={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
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
