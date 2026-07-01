import type { NormalizedHabit } from '../types/habit'

/** One selectable habit in the accountability habit picker, tagged with its parent for context. */
export interface HabitPickerOption {
  id: string
  title: string
  parentTitle: string | null
}

/**
 * Flattens the habit tree into a picker list: every parent followed by its
 * sub-habits (recursively), each sub-habit carrying its parent's title for
 * context. Preserves the top-level sort order so the picker matches the list.
 */
export function buildHabitPickerOptions(
  topLevelHabits: NormalizedHabit[],
  childrenByParent: Map<string, string[]>,
  habitsById: Map<string, NormalizedHabit>,
): HabitPickerOption[] {
  const options: HabitPickerOption[] = []
  const visit = (habit: NormalizedHabit, parentTitle: string | null): void => {
    options.push({ id: habit.id, title: habit.title, parentTitle })
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
