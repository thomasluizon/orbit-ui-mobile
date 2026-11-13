import { MAX_GOAL_TITLE_LENGTH } from '../validation/constants'
import { getGoalDraftFieldErrorKeys } from './goal-form'

/** The questions of the goal flow, in order. The summary is the last step and the place edit opens on. */
export type GoalFlowStep = 'what' | 'track' | 'amount' | 'deadline' | 'habits' | 'summary'

export interface GoalFlowNavigation {
  step: GoalFlowStep
  /** The steps the person came from when the summary opened a step. Back and an answer pop it. */
  trail: readonly GoalFlowStep[]
  direction: 1 | -1
}

export interface GoalFlowOptions {
  mode: 'create' | 'edit'
  /** A goal that starts from a habit already holds its linked habit, so "Which habits" is skipped. */
  fromHabit: boolean
}

/** The steps that remain for this draft. Edit opens on the summary and shows no other step until the person opens one. */
export function goalFlowSteps({ mode, fromHabit }: GoalFlowOptions): GoalFlowStep[] {
  if (mode === 'edit') return ['summary']
  return fromHabit ? ['what', 'track', 'amount', 'deadline', 'summary'] : ['what', 'track', 'amount', 'deadline', 'habits', 'summary']
}

export function startGoalFlow(mode: GoalFlowOptions['mode']): GoalFlowNavigation {
  return { step: mode === 'edit' ? 'summary' : 'what', trail: [], direction: 1 }
}

/** An answer returns to the summary when the summary opened the step. Otherwise the flow moves to the next step. */
export function advanceGoalFlow(navigation: GoalFlowNavigation, steps: readonly GoalFlowStep[]): GoalFlowNavigation {
  const returnTo = navigation.trail.at(-1)
  if (returnTo !== undefined) return { step: returnTo, trail: navigation.trail.slice(0, -1), direction: 1 }
  const next = steps[steps.indexOf(navigation.step) + 1]
  return next === undefined ? navigation : { step: next, trail: [], direction: 1 }
}

/** Back keeps every answer. Null on the first step: the flow then asks to leave. */
export function retreatGoalFlow(navigation: GoalFlowNavigation, steps: readonly GoalFlowStep[]): GoalFlowNavigation | null {
  const returnTo = navigation.trail.at(-1)
  if (returnTo !== undefined) return { step: returnTo, trail: navigation.trail.slice(0, -1), direction: -1 }
  const previous = steps[steps.indexOf(navigation.step) - 1]
  return previous === undefined ? null : { step: previous, trail: [], direction: -1 }
}

/** A press on a value of the summary opens its step, and the answer returns to the summary. */
export function openGoalFlowStep(navigation: GoalFlowNavigation, step: GoalFlowStep): GoalFlowNavigation {
  return { step, trail: [...navigation.trail, navigation.step], direction: 1 }
}

/** Progress counts only the steps that remain. A step the summary opened shows the position of the summary. */
export function goalFlowPosition(navigation: GoalFlowNavigation, steps: readonly GoalFlowStep[]): { position: number; total: number } {
  const index = navigation.trail.length > 0 ? steps.indexOf('summary') : steps.indexOf(navigation.step)
  return { position: Math.max(0, index) + 1, total: steps.length }
}

export interface GoalFlowStepDraft {
  description: string
  targetValue: string
  unit: string
}

export interface GoalFlowStepError {
  field: 'description' | 'targetValue' | 'unit'
  key: string
}

/** The hint a step shows on an empty or invalid continue. The same keys the current form shows for the same values. */
export function getGoalFlowStepError(step: GoalFlowStep, draft: GoalFlowStepDraft): GoalFlowStepError | null {
  if (step === 'what') {
    const description = draft.description.trim()
    if (description.length === 0) return { field: 'description', key: 'goals.form.titleRequired' }
    return description.length > MAX_GOAL_TITLE_LENGTH ? { field: 'description', key: 'goals.form.titleTooLong' } : null
  }
  if (step !== 'amount') return null
  const keys = getGoalDraftFieldErrorKeys(draft.description, draft.targetValue, draft.unit)
  if (keys.targetValue) return { field: 'targetValue', key: keys.targetValue }
  return keys.unit ? { field: 'unit', key: keys.unit } : null
}
