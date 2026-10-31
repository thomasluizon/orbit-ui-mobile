import { getAccountDateTime } from './dates'

export const REPEAT_REMINDER_INTERVALS: readonly number[] = [15, 20, 30, 45, ...Array.from({ length: 23 }, (_, index) => (index + 1) * 60)]

export function repeatReminderClock(instant: string, timeZone?: string | null): string {
  const { minutes } = getAccountDateTime(new Date(instant), timeZone)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function repeatReminderInstant(date: string, clock: string, timeZone?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null
  const wanted = Date.parse(`${date}T${clock}:00Z`)
  if (!Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0, 10) !== date) return null
  let candidate = wanted
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = getAccountDateTime(new Date(candidate), timeZone)
    const localClock = `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}`
    const delta = wanted - Date.parse(`${local.date}T${localClock}:00Z`)
    if (delta === 0) return new Date(candidate).toISOString()
    candidate += delta
  }
  return null
}
