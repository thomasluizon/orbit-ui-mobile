import type { NormalizedHabit, HabitScheduleItem, HabitScheduleChild } from '../types/habit'
import type { HabitListSnapshots } from '../query/keys'
import { collectSelectableDescendantIds } from '../utils/habits'

export function getHabitDeleteConfirmation(
  habitId: string | null,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  childrenByParent: ReadonlyMap<string, string[]>,
): { name: string; descendantCount: number } {
  if (!habitId) return { name: '', descendantCount: 0 }
  return { name: habitsById.get(habitId)?.title ?? '', descendantCount: collectSelectableDescendantIds(
    habitId, descendantId => childrenByParent.get(descendantId) ?? [],
  ).length }
}

export function selectedDescendantsInSnapshots(snapshots: HabitListSnapshots, selectedIds: Set<string>): Set<string> {
  const descendants = new Set<string>()
  const visit = (habit: HabitScheduleItem | HabitScheduleChild, selectedAncestor: boolean) => {
    const selected = selectedIds.has(habit.id)
    if (selected && selectedAncestor) descendants.add(habit.id)
    for (const child of habit.children) visit(child, selectedAncestor || selected)
  }
  for (const [, habits] of snapshots) {
    for (const habit of habits ?? []) visit(habit, false)
  }
  return descendants
}
