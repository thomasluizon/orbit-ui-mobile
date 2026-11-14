import type { UpdateGoalRequest } from '../types/goal'
import { buildGoalTitle, getFirstGoalDraftFieldError, getGoalDraftFieldErrorKeys, parseGoalTargetValue, type GoalDraftFieldError } from '../utils/goal-form'

/** The stored values the edit of a goal starts from. */
export interface GoalEditSource {
  title: string
  targetValue: number
  unit: string
  deadline: string | null
  type?: string
}

export interface GoalEditDraft {
  description: string
  targetValue: string
  unit: string
  deadline: string
}

export function createGoalEditDraft(goal: GoalEditSource): GoalEditDraft {
  return { description: goal.title, targetValue: String(goal.targetValue), unit: goal.unit, deadline: goal.deadline ?? '' }
}

/** An edit is dirty only when a value differs from the stored goal, so an unchanged edit closes with no discard prompt. */
export function isGoalEditDirty(draft: GoalEditDraft, goal: GoalEditSource): boolean {
  return draft.description !== goal.title || draft.targetValue !== String(goal.targetValue) ||
    draft.unit !== goal.unit || draft.deadline !== (goal.deadline ?? '')
}

/** The first invalid field of the draft, with the key the edit form shows for it. */
export function getGoalEditError(draft: GoalEditDraft): GoalDraftFieldError | null {
  return getFirstGoalDraftFieldError(getGoalDraftFieldErrorKeys(draft.description, draft.targetValue, draft.unit))
}

/** The update request of the edit form. Null when the target is not a number. */
export function buildGoalUpdateRequest(draft: GoalEditDraft): UpdateGoalRequest | null {
  const targetValue = parseGoalTargetValue(draft.targetValue)
  if (targetValue === null) return null
  return {
    title: buildGoalTitle(draft.description, draft.targetValue, draft.unit),
    targetValue,
    unit: draft.unit.trim(),
    deadline: draft.deadline || null,
  }
}
