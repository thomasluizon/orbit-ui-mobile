import type { NormalizedHabit } from '../types/habit'
import { hasHabitScheduleOnDate } from './habits'
import { optimisticSkipMarker } from './habit-optimistic'

export function isHabitLoggedOnDate(habit: NormalizedHabit, date: string): boolean {
  void date
  return habit.isLoggedInRange
}

export function isHabitSkippedOnDate(habit: NormalizedHabit, date: string): boolean {
  if (habit.isLoggedInRange) return false
  if (habit.isFlexible) return habit.flexibleTarget === 0 && habit.flexibleCompleted === 0
  return habit.instances.some((instance) => instance.date === date && instance.status === 'Completed')
}

export function getAllDoneOnDate(
  habitsById: Map<string, NormalizedHabit>,
  childrenByParent: Map<string, string[]>,
  date: string,
): { allDone: boolean; count: number } {
  let count = 0
  let openCount = 0
  const visit = (habit: NormalizedHabit): void => {
    if (!habit.isGeneral && !habit.isBadHabit &&
      (hasHabitScheduleOnDate(habit, date) || habit.isOverdue)) {
      const logged = isHabitLoggedOnDate(habit, date)
      const skipped = isHabitSkippedOnDate(habit, date)
      const pendingSkip = Boolean((habit as NormalizedHabit & { [optimisticSkipMarker]?: true })[optimisticSkipMarker])
      const completed = habit.isCompleted || logged
      const done = !skipped && (habit.isFlexible
        ? habit.flexibleTarget !== null && habit.flexibleCompleted !== null &&
          habit.flexibleCompleted >= habit.flexibleTarget && completed
        : completed)
      if (!done && (!skipped || pendingSkip)) openCount++
      if (done) count++
    }
    for (const childId of childrenByParent.get(habit.id) ?? []) {
      const child = habitsById.get(childId)
      if (child) visit(child)
    }
  }
  for (const habit of habitsById.values()) {
    if (habit.parentId === null) visit(habit)
  }
  return { allDone: openCount === 0 && count > 0, count }
}
