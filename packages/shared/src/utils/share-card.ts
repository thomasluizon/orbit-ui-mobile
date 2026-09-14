import { API } from '../api/endpoints'
import type { Recap } from '../types/gamification'
import type { RetrospectiveMetrics } from './retrospective'

export const RECAP_SHARE_PERIODS = ['week', 'month', 'year'] as const

export type RecapSharePeriod = (typeof RECAP_SHARE_PERIODS)[number]

export interface ClosedRecapMonth {
  year: number
  month: number
}

export interface WrappedRouteSelection {
  period: RecapSharePeriod
  closedMonth?: ClosedRecapMonth
}

export const SHARE_CARD_WIDTH = 360
export const SHARE_CARD_HEIGHT = 640
export const SHARE_CARD_FILE_NAME = 'orbit-recap.png'

export const WRAPPED_WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

/** A single figure on the share card with its existing i18n label and display value. */
export interface ShareCardStat {
  labelKey: string
  value: string
}

export interface ShareCardWeekday {
  labelKey: `dates.daysShort.${(typeof WRAPPED_WEEKDAY_KEYS)[number]}`
  percentage: number
}

/** Builds the recap read URL for a share-card period (mirrors `buildRetrospectiveRequestUrl`). */
export function buildRecapRequestUrl(
  period: RecapSharePeriod,
  closedMonth?: ClosedRecapMonth,
): string {
  const params = new URLSearchParams({ period })
  if (period === 'month' && closedMonth) {
    params.set('year', String(closedMonth.year))
    params.set('month', String(closedMonth.month))
  }
  return `${API.gamification.recap}?${params.toString()}`
}

export function parseWrappedRouteSelection(
  periodValue: unknown,
  yearValue: unknown,
  monthValue: unknown,
): WrappedRouteSelection {
  const period = typeof periodValue === 'string' && RECAP_SHARE_PERIODS.includes(periodValue as RecapSharePeriod)
    ? periodValue as RecapSharePeriod
    : 'week'
  if (period !== 'month' || typeof yearValue !== 'string' || typeof monthValue !== 'string') {
    return { period }
  }

  const year = Number(yearValue)
  const month = Number(monthValue)
  if (!/^\d{4}$/.test(yearValue) || !/^\d{1,2}$/.test(monthValue) || month < 1 || month > 12) {
    return { period }
  }
  return { period, closedMonth: { year, month } }
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
export function buildShareCardStats(
  metrics: RetrospectiveMetrics,
  goalCompletions: number,
): ShareCardStat[] {
  return [
    {
      labelKey: 'shareCard.stats.completions',
      value: String(metrics.totalCompletions),
    },
    {
      labelKey: 'shareCard.stats.bestStreak',
      value: String(metrics.bestStreak),
    },
    {
      labelKey: 'progressScreen.sections.goals',
      value: String(goalCompletions),
    },
  ]
}

/** Finds the strongest Monday-first weekday and keeps its shared three-letter label key. */
export function buildShareCardWeekday(weeklyConsistency: readonly number[]): ShareCardWeekday {
  let strongestIndex = 0
  for (let index = 1; index < WRAPPED_WEEKDAY_KEYS.length; index += 1) {
    if ((weeklyConsistency[index] ?? 0) > (weeklyConsistency[strongestIndex] ?? 0)) {
      strongestIndex = index
    }
  }

  const key = WRAPPED_WEEKDAY_KEYS[strongestIndex]!
  const percentage = Math.max(0, Math.min(100, Math.round(weeklyConsistency[strongestIndex] ?? 0)))
  return { labelKey: `dates.daysShort.${key}`, percentage }
}

/** True when the recap has no logged activity, so the share sheet can show an empty state instead of a blank card. */
export function isRecapShareEmpty(
  metrics: RetrospectiveMetrics,
  goalCompletions: number,
): boolean {
  return metrics.totalCompletions === 0 && metrics.activeDays === 0 && goalCompletions === 0
}
