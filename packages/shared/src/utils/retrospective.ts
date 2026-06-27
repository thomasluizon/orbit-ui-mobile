import { z } from 'zod'
import { API } from '../api'
import {
  retrospectiveHabitStatSchema,
  retrospectiveMetricsSchema,
} from '../types/gamification'

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

export interface RetrospectiveNarrative {
  highlights: string
  missed: string
  trends: string
  suggestion: string
}

export interface RetrospectiveResponse {
  period: RetrospectivePeriod
  metrics: RetrospectiveMetrics
  narrative: RetrospectiveNarrative
  fromCache: boolean
}

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
