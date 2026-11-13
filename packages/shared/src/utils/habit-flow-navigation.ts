import type { HabitFlowStepId } from './habit-flow'

export type HabitFlowOptionalId =
  | 'description'
  | 'checklist'
  | 'subHabits'
  | 'avoid'
  | 'tags'
  | 'goals'
  | 'endDate'
  | 'parent'

export type HabitFlowDetailStep =
  | 'type'
  | 'repeat'
  | 'duration'
  | 'reminderKind'
  | 'emoji'
  | 'more'
  | `optional:${HabitFlowOptionalId}`

/** A step the flow can show: one of the five core steps, or a step the summary opens. */
export type HabitFlowStepKey = HabitFlowStepId | HabitFlowDetailStep

export interface HabitFlowNavigation {
  step: HabitFlowStepKey
  /** The steps the person came from when a step was opened from the summary or the optional list. Back pops it. */
  trail: readonly HabitFlowStepKey[]
  direction: 1 | -1
}

export function startHabitFlow(mode: 'create' | 'edit'): HabitFlowNavigation {
  return { step: mode === 'edit' ? 'summary' : 'what', trail: [], direction: 1 }
}

function isCoreStep(step: HabitFlowStepKey, steps: readonly HabitFlowStepId[]): step is HabitFlowStepId {
  return (steps as readonly string[]).includes(step)
}

/** The answer to the current step. A step that came from the summary returns to where it came from. Otherwise the flow moves on. */
export function advanceHabitFlow(navigation: HabitFlowNavigation, steps: readonly HabitFlowStepId[]): HabitFlowNavigation {
  const returnTo = navigation.trail.at(-1)
  if (returnTo !== undefined) return { step: returnTo, trail: navigation.trail.slice(0, -1), direction: 1 }
  if (!isCoreStep(navigation.step, steps)) return navigation
  const next = steps[steps.indexOf(navigation.step) + 1]
  return next === undefined ? navigation : { step: next, trail: [], direction: 1 }
}

/** Back keeps every answer. It returns to where a detail step came from, or to the step before in the list. */
export function retreatHabitFlow(navigation: HabitFlowNavigation, steps: readonly HabitFlowStepId[]): HabitFlowNavigation | null {
  const returnTo = navigation.trail.at(-1)
  if (returnTo !== undefined) return { step: returnTo, trail: navigation.trail.slice(0, -1), direction: -1 }
  if (!isCoreStep(navigation.step, steps)) return null
  const index = steps.indexOf(navigation.step)
  const previous = steps[index - 1]
  return previous === undefined ? null : { step: previous, trail: [], direction: -1 }
}

/** The summary, or the optional list, opens a step and the answer returns to it. */
export function openHabitFlowStep(navigation: HabitFlowNavigation, step: HabitFlowDetailStep | HabitFlowStepId): HabitFlowNavigation {
  return { step, trail: [...navigation.trail, navigation.step], direction: 1 }
}

const CORE_STEPS: readonly HabitFlowStepKey[] = ['what', 'when', 'time', 'reminder', 'summary']

/** Moves the person to the summary when a core step no longer remains, such as the date step after the phrase gave a date. */
export function settleHabitFlow(navigation: HabitFlowNavigation, steps: readonly HabitFlowStepId[]): HabitFlowNavigation {
  if (navigation.trail.length > 0 || isCoreStep(navigation.step, steps)) return navigation
  return CORE_STEPS.includes(navigation.step) ? { ...navigation, step: 'summary' } : navigation
}

export interface HabitFlowPosition {
  position: number
  total: number
}

/** Progress counts only the steps that remain. A detail step shows the position of the summary. */
export function habitFlowPosition(navigation: HabitFlowNavigation, steps: readonly HabitFlowStepId[]): HabitFlowPosition {
  const total = steps.length
  if (isCoreStep(navigation.step, steps)) return { position: steps.indexOf(navigation.step) + 1, total }
  return { position: total, total }
}
