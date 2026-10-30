export type PendingOperationItemGroupType = 'Task' | 'Habit' | 'General'

export interface PendingOperationItemGroup<Item> {
  habitType?: PendingOperationItemGroupType
  items: readonly Item[]
}

const GROUP_TYPES = ['Task', 'Habit', 'General'] as const

export function groupPendingOperationItems<Item extends { habitType?: string | null }>(
  items: readonly Item[],
): readonly PendingOperationItemGroup<Item>[] {
  if (!items.length) return []
  const groups = GROUP_TYPES.map(habitType => ({ habitType, items: items.filter(item => item.habitType === habitType) }))
    .filter(group => group.items.length > 0)
  if (groups.length < 2) return [{ items }]
  const ungrouped = items.filter(item => !GROUP_TYPES.some(habitType => item.habitType === habitType))
  return ungrouped.length ? [{ items: ungrouped }, ...groups] : groups
}
