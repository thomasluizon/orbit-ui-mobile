/** The hour, minute and day-period arithmetic behind the time picker on both platforms. */

export const HOURS_24 = Array.from({ length: 24 }, (_, index) => index)
export const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1)
export const MINUTES = Array.from({ length: 60 }, (_, index) => index)
export const DAY_PERIODS = ['AM', 'PM'] as const

export type DayPeriod = (typeof DAY_PERIODS)[number]

export interface TimeParts {
  hour24: number
  minute: number
}

export function padTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

/** Reads a canonical `HH:MM`. Any other shape, and any out-of-range part, returns null. */
export function parseTimeParts(value: string): TimeParts | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (hour24 > 23 || minute > 59) return null
  return { hour24, minute }
}

/** Writes the canonical `HH:MM` the API stores, whatever the display format is. */
export function formatTimeParts({ hour24, minute }: TimeParts): string {
  return `${padTimePart(hour24)}:${padTimePart(minute)}`
}

export function to12Hour(hour24: number): { hour12: number; period: DayPeriod } {
  return {
    hour12: ((hour24 + 11) % 12) + 1,
    period: hour24 < 12 ? 'AM' : 'PM',
  }
}

export function from12Hour(hour12: number, period: DayPeriod): number {
  const base = hour12 % 12
  return period === 'PM' ? base + 12 : base
}
