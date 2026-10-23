import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  type ReorderableHabitItem,
} from '@orbit/shared/utils'

export interface DragItem extends ReorderableHabitItem {
  id: string
  habit: NormalizedHabit
  depth: number
  hasChildren: boolean
  hasSubHabits: boolean
}

/** Flattens the visible habit forest into draggable rows in render order,
 *  descending into a habit's children only when it is not collapsed. */
export function buildFlatHabitItems(
  visibleHabits: NormalizedHabit[],
  collapsedIds: Set<string>,
  getVisibleChildren: (parentId: string) => NormalizedHabit[],
  maxInlineDepth = Infinity,
): DragItem[] {
  const items: DragItem[] = []

  function addHabitTree(habit: NormalizedHabit, depth: number) {
    const children = getVisibleChildren(habit.id)
    items.push({
      id: habit.id,
      parentId: habit.parentId ?? null,
      habit,
      depth,
      hasChildren: children.length > 0,
      hasSubHabits: habit.hasSubHabits,
    })
    if (depth < maxInlineDepth && !collapsedIds.has(habit.id)) {
      for (const child of children) {
        addHabitTree(child, depth + 1)
      }
    }
  }

  for (const habit of visibleHabits) {
    addHabitTree(habit, 0)
  }

  return items
}

export { buildMoveParentOptions, getHabitDepth, getMoveParentSelection, getSubtreeMaxDepth, isHabitDescendant, validateMoveTarget, type MoveTargetValidation } from '@orbit/shared/utils/move-parent'
