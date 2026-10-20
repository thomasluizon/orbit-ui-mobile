import type { HabitTag, NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { validateReminderSelection } from '../validation/habit-form'
import { validateTagForm } from '../validation/tag-form'
import { TAG_COLORS } from './tag-selection-core'

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

export async function saveHabitDetailTag(
  editing: HabitTag | 'new',
  name: string,
  selectedIds: string[],
  writes: {
    create: (request: { name: string; color: string }) => Promise<{ id: string }>
    update: (request: { tagId: string; name: string; color: string }) => Promise<unknown>
    assign: (tagIds: string[]) => Promise<unknown>
  },
): Promise<string | null> {
  const color = editing === 'new' ? TAG_COLORS[0] : editing.color
  const errorKey = validateTagForm(name, color)
  if (errorKey) return errorKey
  if (editing === 'new') {
    const tag = await writes.create({ name: name.trim(), color })
    await writes.assign([...selectedIds, tag.id])
  } else await writes.update({ tagId: editing.id, name: name.trim(), color })
  return null
}
