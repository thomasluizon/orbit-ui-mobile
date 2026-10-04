import type { NormalizedHabit } from '../types/habit'
import { isHabitLoggedOnDate, isHabitSkippedOnDate } from './all-done'
import { hasHabitScheduleOnDate } from './habits'

export type AstraSuggestion = {
  id: 'logHabit' | 'week' | 'splitHabit' | 'goals'
  key: string
  promptKey?: string
  params?: { habit: string }
}

/** The habits Hoje counts for a day: the general bucket and a bad habit are neither
 *  logged nor split from the empty conversation, so both drop out here. */
function countsForTheDay(habit: NormalizedHabit): boolean {
  return !habit.isGeneral && !habit.isBadHabit
}

/**
 * The drawn openers for an empty Astra conversation, in the drawn order, from the
 * top-level habits the app already loaded for `date`. The two that name a habit are
 * left out when no habit qualifies, so the conversation never names a habit the
 * account lacks.
 */
export function selectAstraSuggestions(
  topLevelHabits: readonly NormalizedHabit[],
  date: string,
): AstraSuggestion[] {
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

  return [
    ...(logHabit ? [{ id: 'logHabit' as const, key: 'chat.suggestion.logHabit', promptKey: 'chat.prompts.logHabit', params: { habit: logHabit.title } }] : []),
    { id: 'week', key: 'chat.suggestion.week' },
    ...(splitHabit ? [{ id: 'splitHabit' as const, key: 'chat.suggestion.splitHabit', promptKey: 'chat.prompts.splitHabit', params: { habit: splitHabit.title } }] : []),
    { id: 'goals', key: 'chat.suggestion.goals' },
  ]
}
