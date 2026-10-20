import type { NormalizedHabit } from '../types/habit'
import { getHabitReminderPatch, toggleHabitDetailGoal, toggleHabitDetailField, mergeHabitReminderChanges, type HabitDetailField, type HabitDetailPatch, type ReminderChanges } from './habit-detail-fields-core'
import { selectHabitGoal } from '../utils/habit-form-state'
import type { StateHook, StateSetter } from './state-adapter'
import type { GoalLinkingFieldProps } from './goal-linking-core'
import { MAX_GOALS_PER_HABIT } from '../validation/constants'

export interface HabitDetailFieldsState {
  goalIds: string[]
  description: string
  setDescription: StateSetter<string>
  openField: HabitDetailField | null
  reminderHabit: NormalizedHabit
  toggleField: (field: HabitDetailField) => void
  goalLinking: Required<GoalLinkingFieldProps>
  updateReminders: (changes: ReminderChanges) => string | null
}

export function createUseHabitDetailFieldsState(useState: StateHook) {
  return function useHabitDetailFieldsState(
    habit: NormalizedHabit,
    onPatch: (patch: HabitDetailPatch) => Promise<boolean>,
  ): HabitDetailFieldsState {
    const [description, setDescription] = useState(habit.description ?? '')
    const [savedDescription, setSavedDescription] = useState(habit.description ?? '')
    if ((habit.description ?? '') !== savedDescription) {
      setSavedDescription(habit.description ?? '')
      if (description === savedDescription) setDescription(habit.description ?? '')
    }
    const [openField, setOpenField] = useState<HabitDetailField | null>(null)
    const [reminders, setReminders] = useState(() => {
      const selection = mergeHabitReminderChanges(habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {})
      return { selection, confirmed: selection, pending: 0 }
    })
    const [goalIds, setGoalIds] = useState(habit.linkedGoals?.map((goal) => goal.id) ?? [])
    const reminderSnapshot = JSON.stringify([habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders])
    const goalSnapshot = JSON.stringify(habit.linkedGoals?.map((goal) => goal.id) ?? [])
    const [savedReminderSnapshot, setSavedReminderSnapshot] = useState(reminderSnapshot)
    const [savedGoalSnapshot, setSavedGoalSnapshot] = useState(goalSnapshot)
    if (reminderSnapshot !== savedReminderSnapshot) {
      setSavedReminderSnapshot(reminderSnapshot)
      const selection = mergeHabitReminderChanges(habit.reminderEnabled, habit.reminderTimes, habit.scheduledReminders, {})
      if (reminders.pending === 0) setReminders({ selection, confirmed: selection, pending: 0 })
    }
    if (goalSnapshot !== savedGoalSnapshot) {
      setSavedGoalSnapshot(goalSnapshot)
      setGoalIds(habit.linkedGoals?.map((goal) => goal.id) ?? [])
    }

    const toggleField = (field: HabitDetailField) => setOpenField(toggleHabitDetailField(openField, field))
    const selectCreatedGoal = (goalId: string) => setGoalIds((current) => selectHabitGoal(current, goalId))
    const toggleGoal = (goalId: string) => {
      const next = toggleHabitDetailGoal(goalIds, goalId)
      setGoalIds(next)
      void onPatch({ goalIds: next }).then((saved) => {
        if (!saved) setGoalIds((current) => current === next ? goalIds : current)
      })
    }
    const updateReminders = (changes: ReminderChanges) => {
      const next = mergeHabitReminderChanges(reminders.selection.reminderEnabled, reminders.selection.reminderTimes, reminders.selection.scheduledReminders, changes)
      const { error, patch } = getHabitReminderPatch(habit, next.reminderEnabled, next.reminderTimes, next.scheduledReminders)
      setReminders((current) => ({ ...current, selection: next, pending: current.pending + (error === null ? 1 : 0) }))
      if (error !== null) return error
      void onPatch(patch).then((saved) => {
        setReminders((current) => saved
          ? { ...current, confirmed: next, pending: current.pending - 1 }
          : { ...current, selection: current.selection === next ? current.confirmed : current.selection, pending: current.pending - 1 })
      })
      return null
    }
    const reminderHabit = { ...habit, ...reminders.selection }

    return {
      goalIds,
      description,
      setDescription,
      openField,
      reminderHabit,
      toggleField,
      goalLinking: {
        habitId: habit.id,
        selectedGoalIds: goalIds,
        atGoalLimit: goalIds.length >= MAX_GOALS_PER_HABIT,
        onToggleGoal: toggleGoal,
        onGoalCreated: selectCreatedGoal,
      },
      updateReminders,
    }
  }
}
