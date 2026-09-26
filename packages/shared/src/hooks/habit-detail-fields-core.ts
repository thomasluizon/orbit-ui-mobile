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

export function toggleHabitDetailField(
  openField: HabitDetailField | null,
  field: HabitDetailField,
): HabitDetailField | null {
  return openField === field ? null : field
}

export function mergeHabitReminderChanges(
  reminderEnabled: boolean,
  reminderTimes: number[],
  scheduledReminders: NormalizedHabit['scheduledReminders'],
  changes: ReminderChanges,
): Pick<NormalizedHabit, 'reminderEnabled' | 'reminderTimes' | 'scheduledReminders'> {
  return {
    reminderEnabled: changes.enabled ?? reminderEnabled,
    reminderTimes: changes.offsets ?? reminderTimes,
    scheduledReminders: changes.scheduled ?? scheduledReminders,
  }
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
