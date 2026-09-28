import type { NormalizedHabit } from '../types/habit'
import { hasHabitScheduleOnDate } from './habits'

export function isHabitLoggedOnDate(habit: NormalizedHabit, date: string): boolean {
  return habit.isLoggedInRange || habit.instances.some(
    (instance) => instance.date === date && instance.status === 'Completed',
  )
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
      if (!habit.isCompleted && !logged) openCount++
      if (habit.isCompleted || logged) count++
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
