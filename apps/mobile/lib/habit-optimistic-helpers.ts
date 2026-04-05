/**
 * Optimistic update helpers for habit list cache mutations.
 *
 * Extracted to reduce nesting depth and cognitive complexity,
 * and to ensure parity between web and mobile.
 */

import type {
  HabitScheduleItem,
  ChecklistItem,
} from '@orbit/shared/types/habit'

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
