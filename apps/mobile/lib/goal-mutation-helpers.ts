import type { QueryClient } from '@tanstack/react-query'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type { Goal, GoalDetailWithMetrics, LinkedHabitInfo } from '@orbit/shared/types/goal'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
export {
  buildTempGoal,
  nextGoalPosition,
  sortGoalsByPosition,
  updateGoalDetailItem,
  updateGoalListItem,
  updateGoalProgressDetail,
  updateGoalProgressItem,
  updateGoalStatusDetail,
  updateGoalStatusItem,
} from '@orbit/shared/utils'

export function restoreGoalLists(
  queryClient: QueryClient,
  previousLists: ReadonlyArray<readonly [readonly unknown[], Goal[] | undefined]>,
): void {
  for (const [key, value] of previousLists) {
    if (value) queryClient.setQueryData(key, value)
  }
}

export function restoreGoalDetail(
  queryClient: QueryClient,
  goalId: string,
  previousDetail: GoalDetailWithMetrics | undefined,
): void {
  queryClient.setQueryData(goalKeys.detail(goalId), previousDetail)
}

export function findLinkedHabits(
  queryClient: QueryClient,
  habitIds: string[],
): LinkedHabitInfo[] {
  if (habitIds.length === 0) {
    return []
  }

  const habits = queryClient
    .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    .flatMap(([, data]) => data ?? [])
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))

  return habitIds
    .map((habitId) => {
      const habit = habitsById.get(habitId)
      return habit ? { id: habit.id, title: habit.title } : null
    })
    .filter((habit): habit is LinkedHabitInfo => habit !== null)
}

export function updateGoalLinkedHabitsItem(goal: Goal, linkedHabits: LinkedHabitInfo[]): Goal {
  return {
    ...goal,
    linkedHabits,
  }
}

export function updateGoalLinkedHabitsDetail(
  detail: GoalDetailWithMetrics | undefined,
  linkedHabits: LinkedHabitInfo[],
): GoalDetailWithMetrics | undefined {
  if (!detail) {
    return detail
  }

  return {
    ...detail,
    goal: {
      ...detail.goal,
      linkedHabits,
    },
  }
}

export async function invalidateGoalQueries(
  queryClient: QueryClient,
  options?: {
    goalId?: string
    includeMetrics?: boolean
    includeHabits?: boolean
  },
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: goalKeys.lists() })

  if (options?.goalId) {
    await queryClient.invalidateQueries({ queryKey: goalKeys.detail(options.goalId) })
    if (options.includeMetrics) {
      await queryClient.invalidateQueries({ queryKey: goalKeys.metrics(options.goalId) })
    }
  }

  if (options?.includeHabits) {
    await queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }
}
