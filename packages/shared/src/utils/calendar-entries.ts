import type { CalendarDayEntry } from '../types/calendar'

export const CALENDAR_MONTH_SWIPE_THRESHOLD = 60

/**
 * Filters a day's calendar entries by the "show recurring" toggle. When the
 * toggle is off, only one-time entries remain (recurring habits are hidden).
 * Shared by the calendar day detail and the week/interval views so the
 * recurring-filter semantics stay identical across every calendar surface.
 */
export function filterRecurringEntries(
  entries: CalendarDayEntry[],
  showRecurring: boolean,
): CalendarDayEntry[] {
  if (showRecurring) return entries
  return entries.filter((entry) => entry.isOneTime)
}

/** Applies the recurring preference to every date before month figures and
 *  rings are derived, so every month surface reads the same filtered source. */
export function filterRecurringDayMap(
  dayMap: Map<string, CalendarDayEntry[]>,
  showRecurring: boolean,
): Map<string, CalendarDayEntry[]> {
  if (showRecurring) return dayMap

  const filtered = new Map<string, CalendarDayEntry[]>()
  for (const [date, entries] of dayMap) {
    filtered.set(date, filterRecurringEntries(entries, false))
  }
  return filtered
}
