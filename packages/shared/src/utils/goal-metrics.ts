export type GoalMetricsStatusTone = 'success' | 'warning' | 'danger' | 'muted'

export interface GoalMetricsStatusPresentation {
  labelKey: string
  tone: GoalMetricsStatusTone
}

export type GoalHabitAdherenceTone = 'success' | 'primary' | 'warning'

export interface GoalMetricsHabitAdherence {
  habitId: string
  habitTitle: string
  weeklyCompletionRate: number
  monthlyCompletionRate: number
  currentStreak: number
}

export interface GoalMetricsViewModel {
  trackingStatus?: string | null
  projectedCompletionDate: string | null
  velocityPerDay: number
  daysToDeadline?: number | null
  habitAdherence: GoalMetricsHabitAdherence[]
}

export function formatGoalMetricsDate(dateStr: string, locale: string): string {
  const datePart = dateStr.slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T00:00:00`)
    : new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  return new Intl.DateTimeFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
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

export function getGoalHabitAdherenceTone(
  weeklyCompletionRate: number,
): GoalHabitAdherenceTone {
  if (weeklyCompletionRate >= 80) return 'success'
  if (weeklyCompletionRate >= 50) return 'primary'
  return 'warning'
}
