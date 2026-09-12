import { API } from '../api/endpoints'
import {
  retrospectiveHabitStatSchema,
  retrospectiveMetricsSchema,
  retrospectiveResponseSchema,
} from '../types/gamification'
import type { z } from 'zod'

const RETROSPECTIVE_WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type RetrospectiveWeekdayKey = (typeof RETROSPECTIVE_WEEKDAY_KEYS)[number]

export type RetrospectivePeriod = 'week' | 'month' | 'quarter' | 'semester' | 'year'

export type RetrospectiveHabitStat = z.infer<typeof retrospectiveHabitStatSchema>

export type RetrospectiveMetrics = z.infer<typeof retrospectiveMetricsSchema>

export type RetrospectiveResponse = z.infer<typeof retrospectiveResponseSchema>

export function buildRetrospectiveRequestUrl(
  period: RetrospectivePeriod,
  language: string,
): string {
  const params = new URLSearchParams({
    period,
    language,
  })

  return `${API.habits.retrospective}?${params.toString()}`
}

/** Selects the first strongest weekday from the API's Monday-through-Sunday percentages. */
export function getBestRetrospectiveWeekdayKey(
  weeklyConsistency: readonly number[],
): RetrospectiveWeekdayKey | null {
  let bestIndex = -1
  let bestPercentage = 0

  for (let index = 0; index < RETROSPECTIVE_WEEKDAY_KEYS.length; index++) {
    const percentage = weeklyConsistency[index] ?? 0
    if (percentage > bestPercentage) {
      bestIndex = index
      bestPercentage = percentage
    }
  }

  return bestIndex < 0 ? null : RETROSPECTIVE_WEEKDAY_KEYS[bestIndex]!
}
