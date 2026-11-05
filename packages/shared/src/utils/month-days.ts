import { getDaysInMonth } from 'date-fns'

export const MIN_HABIT_MONTH_DAY = 1
export const MAX_HABIT_MONTH_DAY = 31
export const HABIT_MONTH_DAY_OPTIONS: readonly number[] = Array.from(
  { length: MAX_HABIT_MONTH_DAY },
  (_, index) => index + MIN_HABIT_MONTH_DAY,
)

type MonthDayTranslator = (key: string, values?: Record<string, string | number>) => string

export function isHabitMonthDay(day: number): boolean {
  return Number.isInteger(day) && day >= MIN_HABIT_MONTH_DAY && day <= MAX_HABIT_MONTH_DAY
}

export function normalizeHabitMonthDays(monthDays: readonly number[] | null | undefined): number[] {
  return [...new Set(monthDays ?? [])].sort((left, right) => left - right)
}

/** Matches the API rule: a chosen day that a short month lacks falls on that month's last day. */
export function matchesHabitMonthDays(monthDays: readonly number[], date: Date): boolean {
  const daysInMonth = getDaysInMonth(date)
  return monthDays.some((day) => Math.min(day, daysInMonth) === date.getDate())
}

/**
 * An empty selection repeats on the start date's day, so the picker shows that day as chosen.
 * A selection equal to that day alone returns to the empty default.
 */
export function toggleHabitMonthDay(monthDays: readonly number[], day: number, anchorDay: number): number[] {
  const selected = monthDays.length > 0 ? monthDays : [anchorDay]
  const next = normalizeHabitMonthDays(selected.includes(day)
    ? selected.filter((selectedDay) => selectedDay !== day)
    : [...selected, day])
  return next.length === 0 || (next.length === 1 && next[0] === anchorDay) ? [] : next
}

export function resolveHabitMonthDaySelection(monthDays: readonly number[], anchorDay: number): number[] {
  return monthDays.length > 0 ? normalizeHabitMonthDays(monthDays) : [anchorDay]
}

export function formatHabitMonthDays(monthDays: readonly number[], translate: MonthDayTranslator): string {
  const labels = normalizeHabitMonthDays(monthDays).map((day) => translate('habits.frequency.monthDay', { day }))
  if (labels.length < 2) return labels[0] ?? ''
  return translate('listFormatting.pair', { first: labels.slice(0, -1).join(', '), last: labels[labels.length - 1]! })
}

export function formatHabitMonthDaySchedule(
  monthDays: readonly number[],
  quantity: number,
  translate: MonthDayTranslator,
): string {
  const days = formatHabitMonthDays(monthDays, translate)
  return quantity === 1
    ? translate('habits.frequency.onMonthDays', { days })
    : translate('habits.frequency.everyNMonthsOnDays', { days, n: quantity })
}
