import type { MetricsCard } from '../types/chat'

export type MetricsRow = Readonly<{
  id: string
  labelKey: string
  value: string | null
}>

export function getMetricsRows(card: MetricsCard): readonly MetricsRow[] {
  if (!card.hasData) return []
  if (card.habitId) {
    return [
      { id: 'currentStreak', labelKey: 'chat.metrics.currentStreak', value: String(card.currentStreak) },
      { id: 'bestStreak', labelKey: 'chat.metrics.longestStreak', value: String(card.bestStreak) },
      { id: 'monthlyRate', labelKey: 'chat.metrics.monthlyRate', value: card.monthlyCompletionRate == null ? null : `${Math.round(card.monthlyCompletionRate)}%` },
    ]
  }
  return [
    { id: 'completionRate', labelKey: 'chat.metrics.completionRate', value: `${card.completionRate}%` },
    { id: 'activeDays', labelKey: 'chat.metrics.daysLogged', value: String(card.activeDays) },
    { id: 'topHabit', labelKey: 'chat.metrics.topHabit', value: card.topHabitName ?? null },
  ]
}

export function metricsFigureLabelKey(id: string, labelKey: string): string {
  const keys: Readonly<Record<string, string>> = {
    completionRate: 'progressScreen.window.completionRate', activeDays: 'progressScreen.window.activeDays',
    currentStreak: 'chat.streakCard.current', bestStreak: 'progressScreen.streak.longest',
  }
  return keys[id] ?? labelKey
}

export function liveMetricsCard(snapshot: MetricsCard, habit: import('../types/habit').HabitMetrics | undefined, retrospective: import('../utils/retrospective').RetrospectiveResponse | undefined): MetricsCard {
  if (snapshot.habitId) return habit ? { ...snapshot, ...habit, hasData: habit.totalCompletions > 0, bestStreak: habit.longestStreak } : snapshot
  if (!retrospective) return snapshot
  const metrics = retrospective.metrics
  return { ...snapshot, ...metrics, hasData: metrics.totalScheduled > 0, series: metrics.completionSeries, topHabitName: metrics.topHabits[0]?.name }
}
