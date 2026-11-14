import { useMemo, useState } from 'react'
import {
  advanceGoalFlow,
  goalFlowPosition,
  goalFlowSteps,
  openGoalFlowStep,
  retreatGoalFlow,
  startGoalFlow,
  type GoalFlowOptions,
  type GoalFlowStep,
} from '@orbit/shared/utils'

/** The place of the person in the goal flow. The draft lives in its owner; this holds only the step, the trail and the direction. */
export function useGuidedGoalFlow(options: GoalFlowOptions) {
  const { mode, fromHabit } = options
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
    open: (step: GoalFlowStep) => setNavigation((current) => openGoalFlowStep(current, step)),
  }
}

export type GuidedGoalFlowNavigation = ReturnType<typeof useGuidedGoalFlow>
