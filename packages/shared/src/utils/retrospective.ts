import { API } from '../api/endpoints'
import {
  retrospectiveHabitStatSchema,
  retrospectiveMetricsSchema,
  retrospectiveResponseSchema,
} from '../types/gamification'
import type { z } from 'zod'

export const RETROSPECTIVE_PERIODS = [
  'week',
  'month',
  'quarter',
  'semester',
  'year',
] as const

export type RetrospectivePeriod = 'week' | 'month' | 'quarter' | 'semester' | 'year'

export type RetrospectiveHabitStat = z.infer<typeof retrospectiveHabitStatSchema>

export type RetrospectiveMetrics = z.infer<typeof retrospectiveMetricsSchema>

export type RetrospectiveResponse = z.infer<typeof retrospectiveResponseSchema>

export const RETROSPECTIVE_CACHE_PREFIX = 'orbit_retrospective_cache_'

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

export function getRetrospectiveCacheKey(period: RetrospectivePeriod): string {
  return `${RETROSPECTIVE_CACHE_PREFIX}${period}`
}
