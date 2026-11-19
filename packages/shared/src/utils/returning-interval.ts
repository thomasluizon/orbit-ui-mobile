import { formatAPIDateInTimeZone, nowDate } from './dates'
import { getDayOffset } from './today-date'

export type ReturningInterval = { kind: 'elapsed'; days: number } | { kind: 'bounded' }

/** The one definition of a gap: the days from the last completion to `today`, from 3 days up. Hoje and Progresso read it. */
export function getReturningIntervalBetween(lastCompletionDate: string, today: string): ReturningInterval | null {
  const days = -getDayOffset(lastCompletionDate, today)
  if (days < 3) return null
  if (days > 30) return { kind: 'bounded' }
  return { kind: 'elapsed', days }
}

export function getReturningInterval(
  lastCompletionDate: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = nowDate(),
): ReturningInterval | null {
  if (!lastCompletionDate) return null
  return getReturningIntervalBetween(lastCompletionDate, formatAPIDateInTimeZone(now, timeZone))
}
