'use client'

import { useCallback, useMemo, useState } from 'react'
import type { NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { validateReminderSelection } from '../validation/habit-form'

export type HabitDetailField =
  | 'goals'
  | 'reminders'
  | 'schedule'
  | 'time'
  | 'description'
  | 'endDate'

export type HabitDetailPatch = Partial<UpdateHabitRequest>

interface ReminderChanges {
  enabled?: boolean
  offsets?: number[]
  scheduled?: NormalizedHabit['scheduledReminders']
}

interface HabitDetailFieldsState {
  cancelReminders: () => void
  close: () => void
  goalIds: string[]
  openField: HabitDetailField | null
  reminderHabit: NormalizedHabit
  save: (patch: HabitDetailPatch) => void
  saveReminders: () => string | null
  toggleField: (field: HabitDetailField) => void
  toggleGoal: (goalId: string) => void
  updateReminders: (changes: ReminderChanges) => void
}

export function useHabitDetailFieldsState(
  habit: NormalizedHabit,
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>,
): HabitDetailFieldsState {
  const [openField, setOpenField] = useState<HabitDetailField | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(habit.reminderEnabled)
  const [reminderTimes, setReminderTimes] = useState(habit.reminderTimes)
  const [scheduledReminders, setScheduledReminders] = useState(habit.scheduledReminders)
  const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])

  const close = useCallback(() => setOpenField(null), [])
  const resetReminderDraft = useCallback(() => {
    setReminderEnabled(habit.reminderEnabled)
    setReminderTimes(habit.reminderTimes)
    setScheduledReminders(habit.scheduledReminders)
  }, [habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders])
  const cancelReminders = useCallback(() => {
    resetReminderDraft()
    close()
  }, [close, resetReminderDraft])
  const toggleField = useCallback((field: HabitDetailField) => {
    if (field === 'reminders' && openField !== field) resetReminderDraft()
    setOpenField(openField === field ? null : field)
  }, [openField, resetReminderDraft])
  const save = useCallback((patch: HabitDetailPatch) => {
    void onPatch(patch).then((saved) => {
      if (saved) close()
    })
  }, [close, onPatch])
  const toggleGoal = useCallback((goalId: string) => {
    const next = goalIds.includes(goalId)
      ? goalIds.filter((id) => id !== goalId)
      : [...goalIds, goalId]
    setGoalIds(next)
    void onPatch({ goalIds: next })
  }, [goalIds, onPatch])
  const updateReminders = useCallback((changes: ReminderChanges) => {
    const enabled = changes.enabled ?? reminderEnabled
    const offsets = changes.offsets ?? reminderTimes
    const scheduled = changes.scheduled ?? scheduledReminders
    setReminderEnabled(enabled)
    setReminderTimes(offsets)
    setScheduledReminders(scheduled)
  }, [reminderEnabled, reminderTimes, scheduledReminders])
  const saveReminders = useCallback(() => {
    const validationError = validateReminderSelection(
      reminderEnabled,
      habit.dueTime ?? '',
      reminderTimes,
      scheduledReminders,
    )
    if (validationError) return validationError
    save({
      reminderEnabled,
      reminderTimes,
      scheduledReminders,
    })
    return null
  }, [habit.dueTime, reminderEnabled, reminderTimes, save, scheduledReminders])
  const reminderHabit = useMemo(() => ({
    ...habit,
    reminderEnabled,
    reminderTimes,
    scheduledReminders,
  }), [habit, reminderEnabled, reminderTimes, scheduledReminders])

  return {
    cancelReminders,
    close,
    goalIds,
    openField,
    reminderHabit,
    save,
    saveReminders,
    toggleField,
    toggleGoal,
    updateReminders,
  }
}
