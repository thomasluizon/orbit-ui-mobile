import type { useQueryClient } from '@tanstack/react-query'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import type {
  HabitScheduleItem,
  HabitScheduleChild,
  ReorderHabitsRequest,
  UpdateHabitRequest,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'

export type HabitListSnapshots = ReadonlyArray<
  readonly [readonly unknown[], HabitScheduleItem[] | undefined]
>

export function snapshotHabitLists(queryClient: ReturnType<typeof useQueryClient>): HabitListSnapshots {
  return queryClient.getQueriesData<HabitScheduleItem[]>({
    queryKey: habitKeys.lists(),
  })
}

export function restoreHabitLists(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: HabitListSnapshots,
): void {
  for (const [key, data] of snapshots) {
    if (data) {
      queryClient.setQueryData(key, data)
    }
  }
}

export function updateHabitLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  queryClient.setQueriesData<HabitScheduleItem[]>(
    { queryKey: habitKeys.lists() },
    (old) => (old ? updater(old) : old),
  )
}

function applyPositionToChild(
  child: HabitScheduleChild,
  positionByHabitId: Map<string, number>,
): HabitScheduleChild {
  const nextPosition = positionByHabitId.get(child.id)
  const patched =
    nextPosition === undefined ? child : { ...child, position: nextPosition }
  if (patched.children.length === 0) return patched
  return {
    ...patched,
    children: patched.children.map((grandchild) =>
      applyPositionToChild(grandchild, positionByHabitId),
    ),
  }
}

export function applyReorderPositions(
  items: HabitScheduleItem[],
  positions: ReorderHabitsRequest['positions'],
): HabitScheduleItem[] {
  const positionByHabitId = new Map(positions.map((p) => [p.habitId, p.position]))
  return items.map((item) => {
    const nextPosition = positionByHabitId.get(item.id)
    const patched =
      nextPosition === undefined ? item : { ...item, position: nextPosition }
    if (patched.children.length === 0) return patched
    return {
      ...patched,
      children: patched.children.map((child) =>
        applyPositionToChild(child, positionByHabitId),
      ),
    }
  })
}

function findCachedGoals(
  queryClient: ReturnType<typeof useQueryClient>,
  goalIds: string[] | undefined,
): Array<{ id: string; title: string }> {
  if (!goalIds?.length) return []

  const goals = queryClient
    .getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
    .flatMap(([, data]) => data ?? [])

  const goalMap = new Map(goals.map((goal) => [goal.id, goal]))

  return goalIds
    .map((goalId) => {
      const goal = goalMap.get(goalId)
      return goal ? { id: goal.id, title: goal.title } : null
    })
    .filter((goal): goal is { id: string; title: string } => goal !== null)
}

export function buildOptimisticHabitPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  data: UpdateHabitRequest,
): Partial<HabitScheduleItem> {
  const patch: Partial<HabitScheduleItem> = {
    title: data.title,
    isBadHabit: data.isBadHabit,
  }

  if ('description' in data) patch.description = data.description ?? null
  if ('emoji' in data) patch.emoji = data.emoji ?? null
  if ('isGeneral' in data) patch.isGeneral = data.isGeneral ?? false
  if ('isFlexible' in data) patch.isFlexible = data.isFlexible ?? false
  if ('frequencyUnit' in data) patch.frequencyUnit = data.frequencyUnit ?? null
  if ('frequencyQuantity' in data) patch.frequencyQuantity = data.frequencyQuantity ?? null
  if ('days' in data) patch.days = data.days ?? []
  if ('dueDate' in data) patch.dueDate = data.dueDate ?? ''
  if ('dueTime' in data) patch.dueTime = data.dueTime ?? null
  if ('dueEndTime' in data) patch.dueEndTime = data.dueEndTime ?? null
  if ('reminderEnabled' in data) patch.reminderEnabled = data.reminderEnabled ?? false
  if ('reminderTimes' in data) patch.reminderTimes = data.reminderTimes ?? []
  if ('scheduledReminders' in data) patch.scheduledReminders = data.scheduledReminders ?? []
  if ('slipAlertEnabled' in data) patch.slipAlertEnabled = data.slipAlertEnabled ?? false
  if ('checklistItems' in data) patch.checklistItems = data.checklistItems ?? []
  if ('goalIds' in data) patch.linkedGoals = findCachedGoals(queryClient, data.goalIds)
  if ('endDate' in data) patch.endDate = data.endDate ?? null

  if (data.clearEndDate) {
    patch.endDate = null
  }

  if (data.isGeneral) {
    patch.frequencyUnit = null
    patch.frequencyQuantity = null
    patch.days = []
    patch.reminderEnabled = false
    patch.reminderTimes = []
    patch.scheduledReminders = []
    patch.dueTime = null
    patch.dueEndTime = null
    patch.endDate = null
  }

  return patch
}
