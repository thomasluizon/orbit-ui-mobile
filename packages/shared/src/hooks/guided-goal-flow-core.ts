import { advanceGoalFlow, goalFlowPosition, goalFlowSteps, openGoalFlowStep, retreatGoalFlow, startGoalFlow, type GoalFlowNavigation, type GoalFlowOptions, type GoalFlowStep } from '../utils/goal-flow'
import type { StateHook } from './state-adapter'

interface GuidedGoalFlowAdapters {
  useState: StateHook
  useMemo: <Value>(calculate: () => Value, dependencies: readonly unknown[]) => Value
}

/** The place of the person in the goal flow, and the moves between its steps. */
export interface GuidedGoalFlowNavigation {
  current: GoalFlowNavigation
  steps: GoalFlowStep[]
  position: { position: number; total: number }
  canGoBack: boolean
  advance: () => void
  back: () => void
  open: (step: GoalFlowStep) => void
}

/** The place of the person in the goal flow. The draft lives in its owner; this holds only the step, the trail and the direction. */
export function createUseGuidedGoalFlow({ useState, useMemo }: GuidedGoalFlowAdapters): (options: GoalFlowOptions) => GuidedGoalFlowNavigation {
  return function useGuidedGoalFlow({ mode, fromHabit }: GoalFlowOptions): GuidedGoalFlowNavigation {
    const steps = useMemo(() => goalFlowSteps({ mode, fromHabit }), [mode, fromHabit])
    const [navigation, setNavigation] = useState(() => startGoalFlow(mode))
    const previous = retreatGoalFlow(navigation, steps)
    return {
      current: navigation,
      steps,
      position: goalFlowPosition(navigation, steps),
      canGoBack: previous !== null,
      advance: () => setNavigation((current) => advanceGoalFlow(current, steps)),
      back: () => { if (previous) setNavigation(previous) },
      open: (step) => setNavigation((current) => openGoalFlowStep(current, step)),
    }
  }
}
