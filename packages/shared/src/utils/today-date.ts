import { MAX_INSTANCE_HORIZON_DAYS } from '../api/constants'

const DAY_MS = 86_400_000

export type TodayBoundary = 'last-loggable' | 'read-only' | 'future' | null

function toDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS)
}

export function getDayOffset(date: string, today: string): number {
  return toDayNumber(date) - toDayNumber(today)
}

export function getTodayBoundary(date: string, today: string): TodayBoundary {
  const offset = getDayOffset(date, today)
  if (offset === -7) return 'last-loggable'
  if (offset < -7) return 'read-only'
  if (offset > 0) return 'future'
  return null
}

export function canNavigateToNextDay(date: string, today: string): boolean {
  return getDayOffset(date, today) < MAX_INSTANCE_HORIZON_DAYS
}
