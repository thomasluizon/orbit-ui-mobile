import { API } from '../api/endpoints'
import type { Recap } from '../types/gamification'
import type { RetrospectiveMetrics } from './retrospective'

export const RECAP_SHARE_PERIODS = ['week', 'month', 'year'] as const

export type RecapSharePeriod = (typeof RECAP_SHARE_PERIODS)[number]

export interface ClosedMonth {
  year: number
  month: number
}

interface WrappedNotificationParams {
  wrapped?: string | string[] | null
  year?: string | string[] | null
  month?: string | string[] | null
}

export function getClosedMonthFromWrappedParams(params: WrappedNotificationParams): ClosedMonth | null {
  if (params.wrapped !== 'month' || typeof params.year !== 'string' || typeof params.month !== 'string') return null
  if (!/^\d{1,4}$/.test(params.year) || !/^\d{1,2}$/.test(params.month)) return null
  const year = Number(params.year)
  const month = Number(params.month)
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 ? { year, month } : null
}

/** A single branded stat tile on the share card: an i18n label key, an emoji, and a pre-formatted display value. */
export interface ShareCardStat {
  labelKey: string
  emoji: string
  value: string
}

/** Builds the recap read URL for a share-card period (mirrors `buildRetrospectiveRequestUrl`). */
export function buildRecapRequestUrl(period: RecapSharePeriod, closedMonth?: ClosedMonth | null): string {
  const params = new URLSearchParams({ period })
  if (period === 'month' && closedMonth) {
    params.set('year', String(closedMonth.year))
    params.set('month', String(closedMonth.month))
  }
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
