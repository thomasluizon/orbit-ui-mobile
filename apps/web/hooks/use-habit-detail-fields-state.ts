'use client'

import { useCallback, useMemo, useState } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { getHabitReminderPatch, toggleHabitDetailGoal, toggleHabitDetailField, mergeHabitReminderChanges, type HabitDetailField, type HabitDetailPatch, type ReminderChanges } from '@orbit/shared/hooks'

interface HabitDetailFieldsState {
  goalIds: string[]
  openField: HabitDetailField | null
  reminderHabit: NormalizedHabit
  toggleField: (field: HabitDetailField) => void
  toggleGoal: (goalId: string) => void
  updateReminders: (changes: ReminderChanges) => string | null
}

export function useHabitDetailFieldsState(
  habit: NormalizedHabit,
  onPatch: (patch: HabitDetailPatch) => Promise<boolean>,
): HabitDetailFieldsState {
  const [openField, setOpenField] = useState<HabitDetailField | null>(null)
  const [reminders, setReminders] = useState(() => {
    const selection = mergeHabitReminderChanges(habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {})
    return { selection, confirmed: selection }
  })
  const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const reminderSnapshot = JSON.stringify([habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders])
  const goalSnapshot = JSON.stringify(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  const [savedReminderSnapshot, setSavedReminderSnapshot] = useState(reminderSnapshot)
  const [savedGoalSnapshot, setSavedGoalSnapshot] = useState(goalSnapshot)
  if (reminderSnapshot !== savedReminderSnapshot) {
    setSavedReminderSnapshot(reminderSnapshot)
    const selection = mergeHabitReminderChanges(habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {})
    setReminders({ selection, confirmed: selection })
  }
  if (goalSnapshot !== savedGoalSnapshot) {
    setSavedGoalSnapshot(goalSnapshot)
    setGoalIds(habit.linkedGoals?.map((goal) => goal.id) ?? [])
  }

  const toggleField = useCallback((field: HabitDetailField) => {
    setOpenField(toggleHabitDetailField(openField, field))
  }, [openField])
  const toggleGoal = useCallback((goalId: string) => {
    const next = toggleHabitDetailGoal(goalIds, goalId)
    setGoalIds(next)
    void onPatch({ goalIds: next }).then((saved) => {
      if (!saved) setGoalIds((current) => current === next ? goalIds : current)
    })
  }, [goalIds, onPatch])
  const updateReminders = useCallback((changes: ReminderChanges) => {
    const next = mergeHabitReminderChanges(reminders.selection.reminderEnabled, reminders.selection.reminderTimes, reminders.selection.scheduledReminders, changes)
    const { error, patch } = getHabitReminderPatch(habit, next.reminderEnabled, next.reminderTimes, next.scheduledReminders)
    setReminders((current) => ({ ...current, selection: next }))
    if (error !== null) return error
    void onPatch(patch).then((saved) => {
      setReminders((current) => saved
        ? { ...current, confirmed: next }
        : { ...current, selection: current.selection === next ? current.confirmed : current.selection })
    })
    return null
  }, [habit, onPatch, reminders.selection])
  const reminderHabit = useMemo(() => ({ ...habit, ...reminders.selection }), [habit, reminders.selection])

  return {
    goalIds,
    openField,
    reminderHabit,
    toggleField,
    toggleGoal,
    updateReminders,
  }
}
