import type { BulkLogResult, HabitScheduleItem } from '../types/habit'
import { findHabitInList } from './habit-optimistic'

type BulkLogStreakTransition = {
  previousStreak: number | undefined
  currentStreak: number | undefined
  countsTowardStreak: boolean
}

export function deriveBulkLogStreakTransition(
  responses: readonly BulkLogResult[],
  successfulEntries: readonly BulkLogResult['results'][number][],
  previousHabits: HabitScheduleItem[],
): BulkLogStreakTransition {
  const successfulIndexes = new Set(successfulEntries.map((entry) => entry.index))
  const countsTowardStreak = responses.some((response) => {
    if (response.previousStreak == null || response.currentStreak !== response.previousStreak + 1) return false
    return response.results.some((entry) => {
      if (entry.logId === null || !successfulIndexes.has(entry.index)) return false
      const habit = findHabitInList(previousHabits, entry.habitId)
      return habit !== null && !habit.isBadHabit
    })
  })

  return {
    previousStreak: responses[0]?.previousStreak ?? undefined,
    currentStreak: responses[responses.length - 1]?.currentStreak ?? undefined,
    countsTowardStreak,
  }
}
