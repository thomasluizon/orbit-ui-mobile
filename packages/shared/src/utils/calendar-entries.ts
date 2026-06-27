import type { CalendarDayEntry } from '../types/calendar'

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
