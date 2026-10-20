import type { NormalizedHabit } from '../types/habit'
import { hasHabitScheduleOnDate } from './habits'
import { optimisticSkipMarker } from './habit-optimistic'

function isPendingSkipOnDate(habit: NormalizedHabit, date: string): boolean {
  return (habit as NormalizedHabit & { [optimisticSkipMarker]?: string })[optimisticSkipMarker] === date
}

export function isHabitLoggedOnDate(habit: NormalizedHabit, date: string): boolean {
  void date
  return habit.isLoggedInRange
}

export function isHabitSkippedOnDate(habit: NormalizedHabit, date: string): boolean {
  if (isPendingSkipOnDate(habit, date)) return true
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
    const pendingSkip = isPendingSkipOnDate(habit, date)
    if (!habit.isGeneral && !habit.isBadHabit &&
      (hasHabitScheduleOnDate(habit, date) || habit.isOverdue || pendingSkip)) {
      const logged = isHabitLoggedOnDate(habit, date)
      const skipped = isHabitSkippedOnDate(habit, date)
      const completed = habit.isCompleted || logged
      const done = !skipped && !pendingSkip && completed
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
