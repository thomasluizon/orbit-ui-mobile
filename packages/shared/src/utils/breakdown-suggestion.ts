import type {
  BulkCreateRequest,
  BulkHabitItem,
  ChecklistItem,
  FrequencyUnit,
} from '../types/habit'

export interface BreakdownEditableHabit {
  title: string
  description: string
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  days: string[] | null
  isBadHabit: boolean
  dueDate: string | null
  checklistItems: ChecklistItem[] | null
}

/** Keeps only breakdown rows whose title is non-empty after trimming. */
export function filterValidBreakdownHabits<T extends BreakdownEditableHabit>(
  habits: readonly T[],
): T[] {
  return habits.filter((habit) => habit.title.trim().length > 0)
}

function resolveBreakdownFrequencyQuantity(
  habit: BreakdownEditableHabit,
): number | undefined {
  if (!habit.frequencyUnit) return undefined
  return habit.frequencyQuantity && habit.frequencyQuantity >= 1
    ? habit.frequencyQuantity
    : 1
}

/**
 * Builds the bulk-create request for a chat breakdown suggestion. With
 * `createAsParent` the rows become sub-habits of a parent named after the
 * suggestion, inheriting the first row's frequency and the earliest due date.
 */
export function buildBreakdownCreateRequest(
  validHabits: readonly BreakdownEditableHabit[],
  parentName: string,
  createAsParent: boolean,
): BulkCreateRequest {
  const subItems: BulkHabitItem[] = validHabits.map((habit) => ({
    title: habit.title.trim(),
    description: habit.description.trim() || undefined,
    frequencyUnit: habit.frequencyUnit ?? undefined,
    frequencyQuantity: resolveBreakdownFrequencyQuantity(habit),
    days: habit.days ?? undefined,
    isBadHabit: habit.isBadHabit,
    dueDate: habit.dueDate ?? undefined,
    checklistItems: habit.checklistItems ?? undefined,
  }))

  if (!createAsParent) {
    return { habits: subItems }
  }

  const firstWithFrequency = validHabits.find((habit) => habit.frequencyUnit)
  const earliestDueDate =
    validHabits
      .map((habit) => habit.dueDate)
      .filter((dueDate): dueDate is string => !!dueDate)
      .sort((a, b) => a.localeCompare(b))[0] ?? new Date().toISOString().slice(0, 10)

  return {
    habits: [
      {
        title: parentName,
        frequencyUnit: firstWithFrequency?.frequencyUnit ?? undefined,
        frequencyQuantity: firstWithFrequency?.frequencyUnit
          ? resolveBreakdownFrequencyQuantity(firstWithFrequency)
          : undefined,
        dueDate: earliestDueDate,
        subHabits: subItems,
      },
    ],
  }
}
