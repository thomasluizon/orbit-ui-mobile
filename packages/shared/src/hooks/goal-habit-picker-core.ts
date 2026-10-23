import type { GoalType } from '../types/goal'
import type { NormalizedHabit } from '../types/habit'
import type { StateHook, StateSetter } from './state-adapter'

export interface GoalHabitsFieldProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}

export interface GoalHabitsPickerProps extends GoalHabitsFieldProps {
  goalType: GoalType
  onClose: () => void
}

export function getGoalHabitProgressNote(selectedIds: string[], habitsById: ReadonlyMap<string, Pick<NormalizedHabit, 'isBadHabit'>> | undefined, goalType: GoalType): string | null {
  if (!selectedIds.some((id) => habitsById?.get(id)?.isBadHabit)) return null
  return goalType === 'Streak' ? 'goals.form.avoidedDays' : 'goals.form.loggedSlips'
}

export interface GoalHabitQuery {
  data: { habitsById: Map<string, NormalizedHabit> } | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

export interface GoalHabitCreationState {
  creatingHabit: boolean
  setCreatingHabit: StateSetter<boolean>
  habitFormState: 'idle' | 'loading' | 'error'
  openHabitForm: () => Promise<void>
  habits: GoalHabitQuery
  items: NormalizedHabit[]
}

export function createUseGoalHabitCreation(useState: StateHook, getAccountGeneration: () => number, useHabits: () => GoalHabitQuery) {
  return function useGoalHabitCreation(loadHabitForm: () => Promise<unknown>, closeSheet: (afterDismiss: () => void) => void): GoalHabitCreationState {
    const habits = useHabits()
    const items = Array.from(habits.data?.habitsById.values() ?? [])
    const [creatingHabit, setCreatingHabit] = useState(false)
    const [habitFormState, setHabitFormState] = useState<'idle' | 'loading' | 'error'>('idle')
    const openHabitForm = async () => {
      const generation = getAccountGeneration()
      setHabitFormState('loading')
      try {
        await loadHabitForm()
        if (getAccountGeneration() !== generation) return
        setHabitFormState('idle')
        closeSheet(() => { if (getAccountGeneration() === generation) setCreatingHabit(true) })
      } catch {
        if (getAccountGeneration() !== generation) return
        setHabitFormState('error')
      }
    }
    return { creatingHabit, setCreatingHabit, habitFormState, openHabitForm, habits, items }
  }
}

export function createGoalHabitPicker<Component, LazyComponent>({ useState, getAccountGeneration, useHabits, loadModule, lazy }: {
  useState: StateHook
  getAccountGeneration: () => number
  useHabits: () => GoalHabitQuery
  loadModule: () => Promise<{ CreateHabitModal: Component }>
  lazy: (loader: () => Promise<{ default: Component }>) => LazyComponent
}): { CreateHabitModal: LazyComponent; useGoalHabitCreation: (closeSheet: (afterDismiss: () => void) => void) => GoalHabitCreationState } {
  const loadHabitForm = () => loadModule().then((module) => ({ default: module.CreateHabitModal }))
  const useCreation = createUseGoalHabitCreation(useState, getAccountGeneration, useHabits)
  return {
    CreateHabitModal: lazy(loadHabitForm),
    useGoalHabitCreation: (closeSheet: (afterDismiss: () => void) => void) => useCreation(loadHabitForm, closeSheet),
  }
}
