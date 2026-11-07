import type { StateHook } from './state-adapter'

/**
 * Builds a hook that keeps the last goal resolved for `goalId`. The edit and progress sheets of the
 * goal detail read it, so a refresh that drops the goal never takes an open sheet off the screen.
 */
export function createUseRetainedGoal(useState: StateHook) {
  return function useRetainedGoal<Goal extends { id: string }>(goal: Goal | null, goalId: string): Goal | null {
    const [retained, setRetained] = useState(goal)
    if (goal !== null && goal !== retained) setRetained(goal)
    return retained?.id === goalId ? retained : null
  }
}
