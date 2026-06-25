import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'
import { formatAPIDate } from './dates'

type ChildContainer = {
  children: HabitScheduleChild[]
  hasSubHabits: boolean
}

export type HabitTreeNode = HabitScheduleItem | HabitScheduleChild

/** Returns tomorrow's date formatted for the API (used to postpone one-time habits). */
export function getTomorrowDateString(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return formatAPIDate(tomorrow)
}

/** Depth-first search for a habit node within a single tree branch. */
export function findHabitInTree(
  node: HabitTreeNode,
  habitId: string,
): HabitTreeNode | null {
  if (node.id === habitId) return node

  for (const child of node.children) {
    const match = findHabitInTree(child, habitId)
    if (match) return match
  }

  return null
}

/** Depth-first search for a habit node across a list of top-level trees. */
export function findHabitInList(
  items: HabitScheduleItem[],
  habitId: string,
): HabitTreeNode | null {
  for (const item of items) {
    const match = findHabitInTree(item, habitId)
    if (match) return match
  }

  return null
}

/**
 * Optimistic patch for skipping a habit: recurring habits leave the current view
 * (marked completed); one-time habits are postponed to tomorrow.
 */
export function buildOptimisticSkipPatch(
  habit: HabitTreeNode,
): Partial<HabitScheduleItem> {
  if (habit.frequencyUnit !== null) return { isCompleted: true }

  const dueDate = getTomorrowDateString()
  return {
    isCompleted: false,
    dueDate,
    scheduledDates: [dueDate],
    isOverdue: false,
    instances: [{ date: dueDate, status: 'Pending', logId: null }],
  }
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
