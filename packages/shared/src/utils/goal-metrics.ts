import { getDateTimeFormat, getNumberFormat } from './intl-format-cache'

const TO_FIXED_MAXIMUM_FRACTION_DIGITS = 100
const GOAL_HISTORY_MAXIMUM_SIGNIFICANT_DIGITS = 20

function getDecimalScale(value: number): number {
  const valueText = Math.abs(value).toString().toLowerCase()
  const exponentMarker = valueText.indexOf('e')
  const coefficient = exponentMarker === -1 ? valueText : valueText.slice(0, exponentMarker)
  const decimalPoint = coefficient.indexOf('.')
  const coefficientScale = decimalPoint === -1 ? 0 : coefficient.length - decimalPoint - 1
  const exponent = exponentMarker === -1 ? 0 : Number(valueText.slice(exponentMarker + 1))
  return Math.min(Math.max(coefficientScale - exponent, 0), TO_FIXED_MAXIMUM_FRACTION_DIGITS)
}

type GoalMetricsStatusTone = 'success' | 'warning' | 'danger' | 'muted'

interface GoalMetricsStatusPresentation {
  labelKey: string
  tone: GoalMetricsStatusTone
}

export function formatGoalMetricsDate(dateStr: string, locale: string): string {
  const datePart = dateStr.slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T00:00:00`)
    : new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  return getDateTimeFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatGoalHistoryNumber(
  value: number,
  locale: string,
): string {
  return getNumberFormat(locale, {
    maximumSignificantDigits: GOAL_HISTORY_MAXIMUM_SIGNIFICANT_DIGITS,
  }).format(value)
}

export function formatGoalHistoryDelta(
  previousValue: number,
  value: number,
  locale: string,
): string {
  const scale = Math.max(getDecimalScale(previousValue), getDecimalScale(value))
  const roundedDelta = Number((value - previousValue).toFixed(scale))
  return getNumberFormat(locale, {
    maximumSignificantDigits: GOAL_HISTORY_MAXIMUM_SIGNIFICANT_DIGITS,
    signDisplay: 'exceptZero',
  }).format(roundedDelta)
}

export function getGoalMetricsStatusPresentation(
  trackingStatus: string | null | undefined,
): GoalMetricsStatusPresentation | null {
  switch (trackingStatus) {
    case 'on_track':
      return { labelKey: 'goals.metrics.onTrack', tone: 'success' }
    case 'at_risk':
      return { labelKey: 'goals.metrics.atRisk', tone: 'warning' }
    case 'behind':
      return { labelKey: 'goals.metrics.behind', tone: 'danger' }
    case 'no_deadline':
      return { labelKey: 'goals.metrics.noDeadline', tone: 'muted' }
    default:
      return null
  }
}
