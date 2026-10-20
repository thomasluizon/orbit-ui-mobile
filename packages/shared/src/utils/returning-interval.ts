import { formatAPIDateInTimeZone, nowDate } from './dates'
import { getDayOffset } from './today-date'

export type ReturningInterval = { kind: 'elapsed'; days: number } | { kind: 'bounded' }

export function getReturningInterval(
  lastCompletionDate: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = nowDate(),
): ReturningInterval | null {
  if (!lastCompletionDate) return null

  const today = formatAPIDateInTimeZone(now, timeZone)
  const days = -getDayOffset(lastCompletionDate, today)
  if (days < 3) return null
  if (days > 30) return { kind: 'bounded' }
  return { kind: 'elapsed', days }
}
