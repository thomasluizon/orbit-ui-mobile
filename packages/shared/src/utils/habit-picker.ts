import type { NormalizedHabit } from '../types/habit'
import { isCompletedOneTimeHabit } from './habit-visibility'

/** One selectable habit in a habit picker, tagged with its parent for context. */
export interface HabitPickerOption {
  id: string
  title: string
  parentTitle: string | null
}

export function buildHabitPickerOptions(
  topLevelHabits: NormalizedHabit[],
  childrenByParent: Map<string, string[]>,
  habitsById: Map<string, NormalizedHabit>,
): HabitPickerOption[] {
  const options: HabitPickerOption[] = []
  const visit = (habit: NormalizedHabit, parentTitle: string | null): void => {
    if (!isCompletedOneTimeHabit(habit)) {
      options.push({ id: habit.id, title: habit.title, parentTitle })
    }
    for (const childId of childrenByParent.get(habit.id) ?? []) {
      const child = habitsById.get(childId)
      if (child) visit(child, habit.title)
    }
  }
  for (const parent of topLevelHabits) visit(parent, null)
  return options
}

/** Case-insensitive filter over a habit's own title and its parent's title. */
export function filterHabitPickerOptions(
  options: HabitPickerOption[],
  query: string,
): HabitPickerOption[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return options
  return options.filter(
    (option) =>
      option.title.toLowerCase().includes(trimmed) ||
      (option.parentTitle?.toLowerCase().includes(trimmed) ?? false),
  )
}
