import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'

type ChildContainer = {
  children: HabitScheduleChild[]
  hasSubHabits: boolean
}

/**
 * Replaces a node's children while keeping `hasSubHabits` consistent: true when
 * children remain, or when the node reported sub-habits the cache never loaded.
 */
export function withChildren<T extends ChildContainer>(
  node: T,
  children: HabitScheduleChild[],
): T {
  return {
    ...node,
    children,
    hasSubHabits: children.length > 0 || (node.hasSubHabits && node.children.length === 0),
  }
}

function patchChildHabit(
  child: HabitScheduleChild,
  habitId: string,
  patch: Partial<HabitScheduleChild>,
): HabitScheduleChild {
  if (child.id === habitId) {
    return { ...child, ...patch }
  }

  return withChildren(
    child,
    child.children.map((nestedChild) => patchChildHabit(nestedChild, habitId, patch)),
  )
}

/** Optimistically patch a parent or child habit anywhere in the cached tree. */
export function optimisticPatchHabit(
  items: HabitScheduleItem[],
  habitId: string,
  patch: Partial<HabitScheduleItem>,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === habitId) return { ...item, ...patch }

    return withChildren(
      item,
      item.children.map((child) =>
        patchChildHabit(child, habitId, patch as Partial<HabitScheduleChild>),
      ),
    )
  })
}
