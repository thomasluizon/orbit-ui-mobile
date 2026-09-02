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
import { findHabitInList, optimisticPatchHabit, withChildren } from '@orbit/shared/utils'

export { optimisticPatchHabit }

/** Toggle isCompleted on a single habit item, resetting checklist if needed */
function toggleHabitCompletion(item: HabitScheduleItem): HabitScheduleItem {
  const wasCompleted = item.isCompleted
  const updated = { ...item, isCompleted: !item.isCompleted }
  if (!wasCompleted && item.frequencyUnit && item.checklistItems.length > 0) {
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
    if (!wasCompleted && child.frequencyUnit && child.checklistItems.length > 0) {
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

/** Set completion for one dated occurrence in a cached habit tree. */
export function optimisticSetDatedCompletion(
  items: HabitScheduleItem[],
  habitId: string,
  date: string,
  completed: boolean,
  logId: string,
): HabitScheduleItem[] {
  const habit = findHabitInList(items, habitId)
  if (!habit) return items

  return optimisticPatchHabit(
    items,
    habitId,
    buildDatedCompletionPatch(habit, date, completed, logId),
  )
}

function buildDatedCompletionPatch(
  habit: HabitScheduleItem | HabitScheduleChild,
  date: string,
  completed: boolean,
  logId: string,
): Partial<HabitScheduleItem> {
  const occurrence = {
    date,
    status: completed ? 'Completed' as const : 'Pending' as const,
    logId: completed ? logId : null,
  }
  const occurrenceIndex = habit.instances.findIndex((instance) => instance.date === date)
  const instances = occurrenceIndex >= 0
    ? habit.instances.map((instance, index) => index === occurrenceIndex ? occurrence : instance)
    : completed
      ? [...habit.instances, occurrence]
      : habit.instances

  return {
    isCompleted: completed,
    isLoggedInRange: instances.some((instance) => instance.status === 'Completed'),
    instances,
  }
}

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

function removeChildHabits(
  children: HabitScheduleChild[],
  habitIds: Set<string>,
): HabitScheduleChild[] {
  const remaining: HabitScheduleChild[] = []
  for (const child of children) {
    if (habitIds.has(child.id)) continue
    remaining.push(withChildren(child, removeChildHabits(child.children, habitIds)))
  }
  return remaining
}

/** Remove one or more parent/child habits from the cached list */
export function optimisticRemoveHabits(
  items: HabitScheduleItem[],
  habitIds: Iterable<string>,
): HabitScheduleItem[] {
  const ids = new Set(habitIds)

  const remaining: HabitScheduleItem[] = []
  for (const item of items) {
    if (ids.has(item.id)) continue
    remaining.push(withChildren(item, removeChildHabits(item.children, ids)))
  }
  return remaining
}

function restoreDeletedChildren(
  current: HabitScheduleChild[],
  snapshot: HabitScheduleChild[],
  failedIds: ReadonlySet<string>,
): HabitScheduleChild[] {
  const currentById = new Map(current.map((child) => [child.id, child]))
  const snapshotIds = new Set(snapshot.map((child) => child.id))
  const restored = snapshot.flatMap((snapshotChild) => {
    if (failedIds.has(snapshotChild.id)) return [snapshotChild]
    const currentChild = currentById.get(snapshotChild.id)
    if (!currentChild) return []
    return [withChildren(
      currentChild,
      restoreDeletedChildren(currentChild.children, snapshotChild.children, failedIds),
    )]
  })

  return [...restored, ...current.filter((child) => !snapshotIds.has(child.id))]
}

/** Restore only failed optimistic deletions from the pre-mutation tree. */
export function restoreDeletedHabits(
  current: HabitScheduleItem[],
  snapshot: HabitScheduleItem[],
  failedIds: ReadonlySet<string>,
): HabitScheduleItem[] {
  const currentById = new Map(current.map((habit) => [habit.id, habit]))
  const snapshotIds = new Set(snapshot.map((habit) => habit.id))
  const restored = snapshot.flatMap((snapshotHabit) => {
    if (failedIds.has(snapshotHabit.id)) return [snapshotHabit]
    const currentHabit = currentById.get(snapshotHabit.id)
    if (!currentHabit) return []
    return [withChildren(
      currentHabit,
      restoreDeletedChildren(currentHabit.children, snapshotHabit.children, failedIds),
    )]
  })

  return [...restored, ...current.filter((habit) => !snapshotIds.has(habit.id))]
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
  positions: { habitId: string; position: number }[],
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
