import type { NormalizedHabit } from '@orbit/shared/types/habit'

export type HabitView = 'today' | 'all' | 'general'

export interface DragItem {
  id: string
  habit: NormalizedHabit
  depth: number
  parentId: string | null
  hasChildren: boolean
  hasSubHabits: boolean
}

/** Groups a flat pre-order list into the panels owned by each top-level habit. */
export function groupDragItemsByPanel(items: DragItem[]): DragItem[][] {
  const panels: DragItem[][] = []
  for (const item of items) {
    if (item.depth === 0 || panels.length === 0) panels.push([])
    panels.at(-1)?.push(item)
  }
  return panels
}

/** Flattens the visible habit forest into draggable rows in render order,
 *  descending into a habit's children only when it is not collapsed. */
export function buildDragItemsFlat(
  habits: NormalizedHabit[],
  collapsedIds: Set<string>,
  getVisibleChildrenForView: (
    habitId: string,
    view: HabitView,
  ) => NormalizedHabit[],
  view: HabitView,
): DragItem[] {
  const items: DragItem[] = []

  function addHabitTree(
    habit: NormalizedHabit,
    depth: number,
    parentId: string | null,
  ) {
    const visChildren = getVisibleChildrenForView(habit.id, view)
    items.push({
      id: habit.id,
      habit,
      depth,
      parentId,
      hasChildren: visChildren.length > 0,
      hasSubHabits: habit.hasSubHabits,
    })
    if (!collapsedIds.has(habit.id)) {
      for (const child of visChildren) {
        addHabitTree(child, depth + 1, habit.id)
      }
    }
  }

  for (const h of habits) {
    addHabitTree(h, 0, null)
  }

  return items
}

export { buildMoveParentOptions, getHabitDepth, getMoveParentSelection, getSubtreeMaxDepth, isHabitDescendant, validateMoveTarget, type MoveTargetValidation } from '@orbit/shared/utils'
