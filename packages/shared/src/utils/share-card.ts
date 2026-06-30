import { API } from '../api'
import type { Recap } from '../types/gamification'
import type { RetrospectiveMetrics } from './retrospective'

export const RECAP_SHARE_PERIODS = ['week', 'month', 'year'] as const

export type RecapSharePeriod = (typeof RECAP_SHARE_PERIODS)[number]

/** A single branded stat tile on the share card: an i18n label key, an emoji, and a pre-formatted display value. */
export interface ShareCardStat {
  labelKey: string
  emoji: string
  value: string
}

/** Builds the recap read URL for a share-card period (mirrors `buildRetrospectiveRequestUrl`). */
export function buildRecapRequestUrl(period: RecapSharePeriod): string {
  const params = new URLSearchParams({ period })
  return `${API.gamification.recap}?${params.toString()}`
}

/** Returns the i18n key for a recap period label (`shareCard.periods.{period}`), covering the full backend period set. */
export function recapPeriodLabelKey(period: Recap['period']): string {
  return `shareCard.periods.${period}`
}

/** Rounds and clamps a 0-100 completion rate to a `NN%` display string. */
export function formatCompletionRate(rate: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(rate)))
  return `${clamped}%`
}

/** Derives the ordered stat-tile model for the share card so web and mobile render identical content. */
export function buildShareCardStats(metrics: RetrospectiveMetrics): ShareCardStat[] {
  return [
    {
      labelKey: 'shareCard.stats.completionRate',
      emoji: '🎯',
      value: formatCompletionRate(metrics.completionRate),
    },
    {
      labelKey: 'shareCard.stats.completions',
      emoji: '✅',
      value: String(metrics.totalCompletions),
    },
    {
      labelKey: 'shareCard.stats.bestStreak',
      emoji: '🏆',
      value: String(metrics.bestStreak),
    },
    {
      labelKey: 'shareCard.stats.activeDays',
      emoji: '📅',
      value: String(metrics.activeDays),
    },
  ]
}

/** True when the recap has no logged activity, so the share sheet can show an empty state instead of a blank card. */
export function isRecapShareEmpty(metrics: RetrospectiveMetrics): boolean {
  return metrics.totalCompletions === 0 && metrics.activeDays === 0
}
