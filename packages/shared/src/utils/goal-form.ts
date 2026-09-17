import { formatAPIDate } from './dates'
import {
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_UNIT_LENGTH,
} from '../validation/constants'
import {
  validateGoalForm,
  validateGoalProgressValue,
} from '../validation/goal-form'

export interface GoalDraftFieldErrorKeys {
  description?: string
  targetValue?: string
  unit?: string
}

export function parseGoalTargetValue(value: string): number | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) return null

  const parsedValue = Number(trimmedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

export function buildGoalTitle(
  description: string,
  targetValue: string | number,
  unit: string,
): string {
  const trimmedDescription = description.trim()
  if (trimmedDescription) return trimmedDescription

  const normalizedTargetValue =
    typeof targetValue === 'number' ? String(targetValue) : targetValue.trim()

  return `${normalizedTargetValue} ${unit.trim()}`.trim()
}

export function validateGoalDraftInput(
  description: string,
  targetValue: string | number | null | undefined,
  unit: string,
): string | null {
  const parsedTargetValue =
    typeof targetValue === 'number'
      ? targetValue
      : parseGoalTargetValue(targetValue ?? '')
  const title = buildGoalTitle(description, targetValue ?? '', unit)

  return validateGoalForm(title, parsedTargetValue, unit)
}

export function getGoalDraftFieldErrorKeys(
  description: string,
  targetValue: string | number | null | undefined,
  unit: string,
): GoalDraftFieldErrorKeys {
  const errors: GoalDraftFieldErrorKeys = {}
  const parsedTargetValue = typeof targetValue === 'number'
    ? targetValue
    : parseGoalTargetValue(targetValue ?? '')
  const title = buildGoalTitle(description, targetValue ?? '', unit)
  const trimmedUnit = unit.trim()

  if (!title.trim()) errors.description = 'goals.form.titleRequired'
  else if (title.trim().length > MAX_GOAL_TITLE_LENGTH) errors.description = 'goals.form.titleTooLong'

  if (!parsedTargetValue || parsedTargetValue <= 0) errors.targetValue = 'goals.form.targetValueRequired'

  if (!trimmedUnit) errors.unit = 'goals.form.unitRequired'
  else if (trimmedUnit.length > MAX_GOAL_UNIT_LENGTH) errors.unit = 'goals.form.unitTooLong'

  return errors
}

export function validateGoalProgressInput(
  value: string | number | null | undefined,
): string | null {
  if (typeof value === 'number') {
    return validateGoalProgressValue(value)
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    if (!trimmedValue) return validateGoalProgressValue(null)

    const parsedValue = Number(trimmedValue)
    return validateGoalProgressValue(
      Number.isFinite(parsedValue) ? parsedValue : Number.NaN,
    )
  }

  return validateGoalProgressValue(value)
}

export function isGoalDeadlinePast(
  deadline: string,
  today = formatAPIDate(new Date()),
): boolean {
  return deadline < today
}

export function isStreakGoal(type?: string): boolean {
  return type === 'Streak'
}
