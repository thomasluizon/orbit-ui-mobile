import type { RetrospectiveMetrics } from './retrospective'
import { getBestRetrospectiveWeekdayKey } from './retrospective'

export const PROGRESS_FIGURE_KEYS = ['completionRate', 'activeDays', 'bestWeekday'] as const

export type ProgressFigureKey = (typeof PROGRESS_FIGURE_KEYS)[number]

/** The three figures of the Progresso root as the person last saw them. A weekday with no data is null. */
export type ProgressFigureValues = Readonly<Record<ProgressFigureKey, number | string | null>>

export function readProgressFigures(metrics: Pick<RetrospectiveMetrics, 'completionRate' | 'activeDays' | 'weeklyConsistency'>): ProgressFigureValues {
  return {
    completionRate: Math.round(metrics.completionRate),
    activeDays: metrics.activeDays,
    bestWeekday: getBestRetrospectiveWeekdayKey(metrics.weeklyConsistency),
  }
}

/** The figures that differ from the last visit. A first visit has nothing to compare, so nothing changed. */
export function changedProgressFigures(
  previous: ProgressFigureValues | null,
  current: ProgressFigureValues,
): ReadonlySet<ProgressFigureKey> {
  if (!previous) return new Set()
  return new Set(PROGRESS_FIGURE_KEYS.filter((key) => previous[key] !== current[key]))
}

function isFigureValue(value: unknown): value is number | string | null {
  return value === null || typeof value === 'number' || typeof value === 'string'
}

/** Reads a stored value back. Anything that is not three figures reads as a first visit. */
export function parseProgressFigures(value: unknown): ProgressFigureValues | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!PROGRESS_FIGURE_KEYS.every((key) => isFigureValue(record[key]))) return null
  return {
    completionRate: record.completionRate as number | string | null,
    activeDays: record.activeDays as number | string | null,
    bestWeekday: record.bestWeekday as number | string | null,
  }
}
