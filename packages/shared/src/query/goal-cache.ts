import type { QueryClient } from '@tanstack/query-core'
import { goalKeys, habitKeys } from './keys'
import type { Goal, GoalDetailWithMetrics, LinkedHabitInfo } from '../types/goal'
import type { HabitScheduleItem } from '../types/habit'
import { updateGoalProgressDetail, updateGoalProgressItem, updateGoalStatusDetail, updateGoalStatusItem, updateGoalDetailItem, updateGoalListItem } from '../utils/goal-mutations'
import type { GoalPositionItem, UpdateGoalRequest, GoalStatus } from '../types/goal'

export function restoreGoalLists(
  queryClient: QueryClient,
  previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[],
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
    await queryClient.invalidateQueries({ queryKey: habitKeys.details() })
  }
}

export async function removeGoalFromCache(queryClient: QueryClient, goalId: string): Promise<GoalListSnapshot> {
  await queryClient.cancelQueries({ queryKey: goalKeys.lists() })
  const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
  queryClient.setQueriesData<Goal[]>({ queryKey: goalKeys.lists() }, (goals) => goals?.filter((goal) => goal.id !== goalId))
  return { previousLists }
}

export async function reorderGoalCache(queryClient: QueryClient, positions: GoalPositionItem[]): Promise<GoalListSnapshot> {
  await queryClient.cancelQueries({ queryKey: goalKeys.lists() })
  const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
  const byId = new Map(positions.map(({ id, position }) => [id, position]))
  queryClient.setQueriesData<Goal[]>({ queryKey: goalKeys.lists() }, (goals) => goals?.map((goal) => {
    const position = byId.get(goal.id)
    return position === undefined ? goal : { ...goal, position }
  }))
  return { previousLists }
}

type GoalCacheChange = { type: 'update'; request: UpdateGoalRequest } | { type: 'progress'; currentValue: number } | { type: 'status'; status: GoalStatus }

export async function updateGoalCache(queryClient: QueryClient, goalId: string, change: GoalCacheChange, cancelDetail = false): Promise<GoalListSnapshot & { previousDetail: GoalDetailWithMetrics | undefined }> {
  await queryClient.cancelQueries({ queryKey: goalKeys.lists() })
  if (cancelDetail) await queryClient.cancelQueries({ queryKey: goalKeys.detail(goalId) })
  const previousLists = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
  const previousDetail = queryClient.getQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId))
  queryClient.setQueriesData<Goal[]>({ queryKey: goalKeys.lists() }, (goals) => goals?.map((goal) => {
    if (goal.id !== goalId) return goal
    if (change.type === 'progress') return updateGoalProgressItem(goal, change.currentValue)
    if (change.type === 'status') return updateGoalStatusItem(goal, change.status)
    return updateGoalListItem(goal, change.request)
  }))
  queryClient.setQueryData<GoalDetailWithMetrics>(goalKeys.detail(goalId), (detail) => {
    if (change.type === 'progress') return updateGoalProgressDetail(detail, change.currentValue)
    if (change.type === 'status') return updateGoalStatusDetail(detail, change.status)
    return updateGoalDetailItem(detail, change.request)
  })
  return { previousLists, previousDetail }
}

type GoalListSnapshot = { previousLists: readonly (readonly [readonly unknown[], Goal[] | undefined])[] }

export function goalListRollback(queryClient: QueryClient) {
  return (_error: unknown, _variables: unknown, context: GoalListSnapshot | undefined): void => {
    if (context) restoreGoalLists(queryClient, context.previousLists)
  }
}

export function goalDetailRollback(queryClient: QueryClient) {
  return (_error: unknown, variables: { goalId: string }, context: (GoalListSnapshot & { previousDetail: GoalDetailWithMetrics | undefined }) | undefined): void => {
    if (context) restoreGoalLists(queryClient, context.previousLists)
    restoreGoalDetail(queryClient, variables.goalId, context?.previousDetail)
  }
}

export function goalDetailSettled(queryClient: QueryClient, isQueued: (result: unknown) => boolean = () => false) {
  return (result: unknown, _error: unknown, { goalId }: { goalId: string }): void => {
    if (!isQueued(result)) void invalidateGoalQueries(queryClient, { goalId, includeMetrics: true })
  }
}
