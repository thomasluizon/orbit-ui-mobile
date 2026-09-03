'use client'

import { useCallback, useMemo, useState } from 'react'
import type { NormalizedHabit, UpdateHabitRequest } from '../types/habit'

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
  close: () => void
  goalIds: string[]
  openField: HabitDetailField | null
  reminderHabit: NormalizedHabit
  save: (patch: HabitDetailPatch) => void
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
  const toggleField = useCallback((field: HabitDetailField) => {
    setOpenField((current) => current === field ? null : field)
  }, [])
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
    void onPatch({
      reminderEnabled: enabled,
      reminderTimes: offsets,
      scheduledReminders: scheduled,
    })
  }, [onPatch, reminderEnabled, reminderTimes, scheduledReminders])
  const reminderHabit = useMemo(() => ({
    ...habit,
    reminderEnabled,
    reminderTimes,
    scheduledReminders,
  }), [habit, reminderEnabled, reminderTimes, scheduledReminders])

  return {
    close,
    goalIds,
    openField,
    reminderHabit,
    save,
    toggleField,
    toggleGoal,
    updateReminders,
  }
}
