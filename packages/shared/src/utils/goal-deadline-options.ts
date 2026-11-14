import { getAccountDay } from './dates'

/** The quick options of the "By when" step. `none` saves the goal with no deadline. */
export type GoalDeadlineChoice = 'none' | 'monthEnd' | 'yearEnd'

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The last day of the month that holds `now` in the account time zone, as `YYYY-MM-DD`. */
export function resolveMonthEndDeadline(now: Date, timeZone: string | null | undefined): string {
  const [year, month] = getAccountDay(now, timeZone).split('-').map(Number) as [number, number]
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`
}

/** The last day of the year that holds `now` in the account time zone, as `YYYY-MM-DD`. */
export function resolveYearEndDeadline(now: Date, timeZone: string | null | undefined): string {
  return `${getAccountDay(now, timeZone).slice(0, 4)}-12-31`
}

/** The deadline a quick option saves: an empty string for no deadline, the same value the current form sends. */
export function resolveGoalDeadlineChoice(choice: GoalDeadlineChoice, now: Date, timeZone: string | null | undefined): string {
  if (choice === 'monthEnd') return resolveMonthEndDeadline(now, timeZone)
  if (choice === 'yearEnd') return resolveYearEndDeadline(now, timeZone)
  return ''
}
