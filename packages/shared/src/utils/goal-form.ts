import { formatAPIDate } from './dates'

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

export function isGoalDeadlinePast(
  deadline: string,
  today = formatAPIDate(new Date()),
): boolean {
  return deadline < today
}
