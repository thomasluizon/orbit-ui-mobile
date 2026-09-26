import type { NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { validateReminderSelection } from '../validation/habit-form'

export type HabitDetailField = 'goals' | 'reminders' | 'schedule' | 'time' | 'description' | 'endDate'
export type HabitDetailPatch = Partial<UpdateHabitRequest>

export interface ReminderChanges {
  enabled?: boolean
  offsets?: number[]
  scheduled?: NormalizedHabit['scheduledReminders']
}

export function toggleHabitDetailGoal(goalIds: string[], goalId: string): string[] {
  return goalIds.includes(goalId)
    ? goalIds.filter((id) => id !== goalId)
    : [...goalIds, goalId]
}

export function getHabitReminderPatch(
  habit: NormalizedHabit,
  reminderEnabled: boolean,
  reminderTimes: number[],
  scheduledReminders: NormalizedHabit['scheduledReminders'],
): { error: string; patch?: never } | { error: null; patch: HabitDetailPatch } {
  const error = validateReminderSelection(
    reminderEnabled, habit.dueTime ?? '', reminderTimes, scheduledReminders,
  )
  if (error) return { error }
  return { error: null, patch: { reminderEnabled, reminderTimes, scheduledReminders } }
}
