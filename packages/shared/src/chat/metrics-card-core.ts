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
