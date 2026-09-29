import type { NormalizedHabit } from '../types/habit'
import { isHabitLoggedOnDate, isHabitSkippedOnDate } from './all-done'
import { hasHabitScheduleOnDate } from './habits'

export interface AstraSuggestionHabits {
  logHabitTitle: string | null
  splitHabitTitle: string | null
}

/** The habits Hoje counts for a day: the general bucket and a bad habit are neither
 *  logged nor split from the empty conversation, so both drop out here. */
function countsForTheDay(habit: NormalizedHabit): boolean {
  return !habit.isGeneral && !habit.isBadHabit
}

/**
 * Picks the two habit-bound suggestions the empty Astra conversation offers, from
 * the top-level habits the app already loaded for `date`. Each title is `null` when
 * no habit qualifies, so the conversation never names a habit the account lacks.
 */
export function selectAstraSuggestionHabits(
  topLevelHabits: readonly NormalizedHabit[],
  date: string,
): AstraSuggestionHabits {
  const logHabit = topLevelHabits.find((habit) =>
    countsForTheDay(habit) &&
    (hasHabitScheduleOnDate(habit, date) || habit.isOverdue) &&
    !habit.isCompleted &&
    !isHabitLoggedOnDate(habit, date) &&
    !isHabitSkippedOnDate(habit, date),
  )

  const splitHabit = topLevelHabits.find((habit) =>
    countsForTheDay(habit) && !habit.hasSubHabits,
  )

  return {
    logHabitTitle: logHabit?.title ?? null,
    splitHabitTitle: splitHabit?.title ?? null,
  }
}
