/**
 * Optimistic update helpers for habit list cache mutations.
 *
 * Extracted from use-habits.ts to reduce nesting depth (SonarQube S2004)
 * and cognitive complexity (S3776).
 */

import type {
  HabitScheduleItem,
  ChecklistItem,
  HabitScheduleChild,
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
    updated.checklistItems = item.checklistItems.map((i) => ({ ...i, isChecked: false }))
  }
  return updated
}

/** Toggle isCompleted on a child within an item's children array */
function toggleChildCompletion(
  item: HabitScheduleItem,
  habitId: string,
): HabitScheduleItem {
  return {
    ...item,
    children: item.children.map((c) => {
      if (c.id !== habitId) return c
      const wasCompleted = c.isCompleted
      const updated = { ...c, isCompleted: !c.isCompleted }
      if (!wasCompleted && c.frequencyUnit && c.checklistItems?.length > 0) {
        updated.checklistItems = c.checklistItems.map((i) => ({ ...i, isChecked: false }))
      }
      return updated
    }),
  }
}

/** Optimistically toggle completion for a habit in a list (parent or child) */
export function optimisticToggleCompletion(
  items: HabitScheduleItem[],
  habitId: string,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === habitId) return toggleHabitCompletion(item)
    if (item.children.some((c) => c.id === habitId)) return toggleChildCompletion(item, habitId)
    return item
  })
}

// ---------------------------------------------------------------------------
// Update checklist
// ---------------------------------------------------------------------------

/** Optimistically update checklist items for a habit in a list */
export function optimisticUpdateChecklist(
  items: HabitScheduleItem[],
  habitId: string,
  newItems: ChecklistItem[],
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === habitId) return { ...item, checklistItems: newItems }
    if (item.children.some((c) => c.id === habitId)) {
      return {
        ...item,
        children: item.children.map((c) =>
          c.id === habitId ? { ...c, checklistItems: newItems } : c,
        ),
      }
    }
    return item
  })
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
