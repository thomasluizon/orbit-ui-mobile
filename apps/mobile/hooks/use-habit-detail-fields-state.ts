import { useCallback, useMemo, useState } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getHabitReminderPatch, toggleHabitDetailGoal, toggleHabitDetailField, mergeHabitReminderChanges, type HabitDetailField, type HabitDetailPatch, type ReminderChanges } from '@orbit/shared/hooks'

interface HabitDetailFieldsState {
  close: () => void
  goalIds: string[]
  openField: HabitDetailField | null
  reminderHabit: NormalizedHabit
  save: (patch: HabitDetailPatch) => void
  toggleField: (field: HabitDetailField) => void
  toggleGoal: (goalId: string) => void
  updateReminders: (changes: ReminderChanges) => string | null
}

export function useHabitDetailFieldsState(
  habit: NormalizedHabit,
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>,
): HabitDetailFieldsState {
  const [openField, setOpenField] = useState<HabitDetailField | null>(null)
  const [reminders, setReminders] = useState(() => mergeHabitReminderChanges(
    habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {},
  ))
  const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const reminderSnapshot = JSON.stringify([habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders])
  const goalSnapshot = JSON.stringify(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const [savedReminderSnapshot, setSavedReminderSnapshot] = useState(reminderSnapshot)
  const [savedGoalSnapshot, setSavedGoalSnapshot] = useState(goalSnapshot)
  if (reminderSnapshot !== savedReminderSnapshot) {
    setSavedReminderSnapshot(reminderSnapshot)
    setReminders(mergeHabitReminderChanges(habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {}))
  }
  if (goalSnapshot !== savedGoalSnapshot) {
    setSavedGoalSnapshot(goalSnapshot)
    setGoalIds(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  }

  const close = useCallback(() => setOpenField(null), [])
  const toggleField = useCallback((field: HabitDetailField) => {
    setOpenField(toggleHabitDetailField(openField, field))
  }, [openField])
  const save = useCallback((patch: HabitDetailPatch) => {
    void onPatch(patch).then((saved) => {
      if (saved) close()
    })
  }, [close, onPatch])
  const toggleGoal = useCallback((goalId: string) => {
    const next = toggleHabitDetailGoal(goalIds, goalId)
    setGoalIds(next)
    void onPatch({ goalIds: next }).then((saved) => {
      if (!saved) setGoalIds((current) => current === next ? goalIds : current)
    })
  }, [goalIds, onPatch])
  const updateReminders = useCallback((changes: ReminderChanges) => {
    const next = mergeHabitReminderChanges(reminders.reminderEnabled, reminders.reminderTimes, reminders.scheduledReminders, changes)
    const { error, patch } = getHabitReminderPatch(habit, next.reminderEnabled, next.reminderTimes, next.scheduledReminders)
    setReminders(next)
    if (error !== null) return error
    void onPatch(patch).then((saved) => {
      if (!saved) setReminders((current) => current === next ? reminders : current)
    })
    return null
  }, [habit, onPatch, reminders])
  const reminderHabit = useMemo(() => ({ ...habit, ...reminders }), [habit, reminders])

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
