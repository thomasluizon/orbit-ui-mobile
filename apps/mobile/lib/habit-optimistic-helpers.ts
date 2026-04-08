/**
 * Optimistic update helpers for habit list cache mutations.
 *
 * Extracted to reduce nesting depth and cognitive complexity,
 * and to ensure parity between web and mobile.
 */

import type {
  ChecklistItem,
  HabitScheduleChild,
  HabitScheduleItem,
} from '@orbit/shared/types/habit'

type ChildContainer = {
  children: HabitScheduleChild[]
  hasSubHabits: boolean
}

function withChildren<T extends ChildContainer>(
  node: T,
  children: HabitScheduleChild[],
): T {
  return {
    ...node,
    children,
    hasSubHabits: children.length > 0 || (node.hasSubHabits && node.children.length === 0),
  }
}

// ---------------------------------------------------------------------------
// Toggle completion
// ---------------------------------------------------------------------------

/** Toggle isCompleted on a single habit item, resetting checklist if needed */
function toggleHabitCompletion(item: HabitScheduleItem): HabitScheduleItem {
  const wasCompleted = item.isCompleted
  const updated = { ...item, isCompleted: !item.isCompleted }
  if (!wasCompleted && item.frequencyUnit && item.checklistItems?.length > 0) {
    updated.checklistItems = item.checklistItems.map((entry) => ({
      ...entry,
      isChecked: false,
    }))
  }
  return updated
}

function toggleChildCompletion(
  child: HabitScheduleChild,
  habitId: string,
): HabitScheduleChild {
  if (child.id === habitId) {
    const wasCompleted = child.isCompleted
    const updated = { ...child, isCompleted: !child.isCompleted }
    if (!wasCompleted && child.frequencyUnit && child.checklistItems?.length > 0) {
      updated.checklistItems = child.checklistItems.map((entry) => ({
        ...entry,
        isChecked: false,
      }))
    }
    return updated
  }

  return withChildren(
    child,
    child.children.map((nestedChild) => toggleChildCompletion(nestedChild, habitId)),
  )
}

/** Optimistically toggle completion for a habit in a list (parent or child) */
export function optimisticToggleCompletion(
  items: HabitScheduleItem[],
  habitId: string,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === habitId) return toggleHabitCompletion(item)
    return withChildren(
      item,
      item.children.map((child) => toggleChildCompletion(child, habitId)),
    )
  })
}

// ---------------------------------------------------------------------------
// Update checklist
// ---------------------------------------------------------------------------

function updateChecklistInChild(
  child: HabitScheduleChild,
  habitId: string,
  newItems: ChecklistItem[],
): HabitScheduleChild {
  if (child.id === habitId) {
    return { ...child, checklistItems: newItems }
  }

  return withChildren(
    child,
    child.children.map((nestedChild) =>
      updateChecklistInChild(nestedChild, habitId, newItems),
    ),
  )
}

/** Optimistically update checklist items for a habit in a list */
export function optimisticUpdateChecklist(
  items: HabitScheduleItem[],
  habitId: string,
  newItems: ChecklistItem[],
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === habitId) return { ...item, checklistItems: newItems }
    return withChildren(
      item,
      item.children.map((child) => updateChecklistInChild(child, habitId, newItems)),
    )
  })
}

// ---------------------------------------------------------------------------
// General tree helpers
// ---------------------------------------------------------------------------

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

/** Optimistically patch a parent or child habit in-place */
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

function removeChildHabits(
  children: HabitScheduleChild[],
  habitIds: Set<string>,
): HabitScheduleChild[] {
  return children
    .filter((child) => !habitIds.has(child.id))
    .map((child) => withChildren(child, removeChildHabits(child.children, habitIds)))
}

/** Remove one or more parent/child habits from the cached list */
export function optimisticRemoveHabits(
  items: HabitScheduleItem[],
  habitIds: Iterable<string>,
): HabitScheduleItem[] {
  const ids = new Set(habitIds)

  return items
    .filter((item) => !ids.has(item.id))
    .map((item) => withChildren(item, removeChildHabits(item.children, ids)))
}

/** Insert a new top-level habit into the cached list */
export function optimisticInsertHabit(
  items: HabitScheduleItem[],
  habit: HabitScheduleItem,
): HabitScheduleItem[] {
  return [...items, habit]
}

function insertChildHabit(
  children: HabitScheduleChild[],
  parentId: string,
  newChild: HabitScheduleChild,
): HabitScheduleChild[] {
  return children.map((child) => {
    if (child.id === parentId) {
      return withChildren(child, [...child.children, newChild])
    }

    return withChildren(child, insertChildHabit(child.children, parentId, newChild))
  })
}

/** Insert a new child habit into a cached parent's children array */
export function optimisticInsertSubHabit(
  items: HabitScheduleItem[],
  parentId: string,
  habit: HabitScheduleChild,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === parentId) {
      return withChildren(item, [...item.children, habit])
    }

    return withChildren(item, insertChildHabit(item.children, parentId, habit))
  })
}

function reorderChildHabit(
  child: HabitScheduleChild,
  positionMap: Map<string, number>,
): HabitScheduleChild {
  return withChildren(
    {
      ...child,
      position: positionMap.get(child.id) ?? child.position,
    },
    child.children.map((nestedChild) => reorderChildHabit(nestedChild, positionMap)),
  )
}

/** Optimistically apply position updates from a reorder request */
export function optimisticReorderHabits(
  items: HabitScheduleItem[],
  positions: Array<{ habitId: string; position: number }>,
): HabitScheduleItem[] {
  const positionMap = new Map(positions.map((item) => [item.habitId, item.position]))

  return items.map((item) =>
    withChildren(
      {
        ...item,
        position: positionMap.get(item.id) ?? item.position,
      },
      item.children.map((child) => reorderChildHabit(child, positionMap)),
    ),
  )
}
