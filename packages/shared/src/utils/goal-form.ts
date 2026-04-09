import { formatAPIDate } from './dates'
import {
  validateGoalForm,
  validateGoalProgressValue,
} from '../validation'

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
