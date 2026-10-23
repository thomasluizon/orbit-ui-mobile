import type { Goal } from '../types/goal'
import { selectHabitGoal, toggleSelectedId } from '../utils/habit-form-state'
import type { StateHook, StateSetter } from './state-adapter'

export interface GoalLinkingFieldProps {
  habitId?: string
  selectedGoalIds: string[]
  atGoalLimit: boolean
  onToggleGoal: (goalId: string) => void
  onGoalCreated?: (goalId: string) => void
}

interface GoalLinkingState {
  open: boolean
  setOpen: StateSetter<boolean>
  creating: boolean
  setCreating: StateSetter<boolean>
  activeGoals: Goal[]
  selectedSet: Set<string>
  selectedGoals: Goal[]
  openCreateGoal: () => void
  handleCreated: (goalId: string, habitIds: string[]) => void
  initialHabitIds: string[]
}

export function createUseGoalLinking(useState: StateHook) {
  return function useGoalLinking(props: GoalLinkingFieldProps, goals: Goal[] | undefined, closeSheet: (afterDismiss: () => void) => void): GoalLinkingState {
    const { habitId, selectedGoalIds, atGoalLimit, onGoalCreated, onToggleGoal } = props
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const activeGoals = goals?.filter((goal) => goal.status === 'Active') ?? []
    const selectedSet = new Set(selectedGoalIds)
    const selectedGoals = activeGoals.filter((goal) => selectedSet.has(goal.id))
    const openCreateGoal = () => closeSheet(() => {
      setOpen(false)
      setCreating(true)
    })
    const handleCreated = (goalId: string, habitIds: string[]) => {
      if (atGoalLimit || (habitId && !habitIds.includes(habitId))) return
      if (onGoalCreated) onGoalCreated(goalId)
      else if (!habitId) onToggleGoal(goalId)
    }
    return { open, setOpen, creating, setCreating, activeGoals, selectedSet, selectedGoals, openCreateGoal, handleCreated, initialHabitIds: habitId ? [habitId] : [] }
  }
}

export function useHabitGoalSelection(setGoalIds: StateSetter<string[]>, touched: { current: { goalIds: boolean } }): { toggleGoal: (goalId: string) => void; selectCreatedGoal: (goalId: string) => void } {
  return {
    toggleGoal: (goalId: string) => {
      touched.current.goalIds = true
      setGoalIds((current) => toggleSelectedId(current, goalId))
    },
    selectCreatedGoal: (goalId: string) => {
      touched.current.goalIds = true
      setGoalIds((current) => selectHabitGoal(current, goalId))
    },
  }
}
