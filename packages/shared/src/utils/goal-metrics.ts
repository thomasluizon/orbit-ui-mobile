import { getDateTimeFormat } from './intl-format-cache'

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
