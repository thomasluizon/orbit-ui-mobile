import type { NormalizedHabit } from '../types/habit'
import { formatAPIDateInTimeZone } from '../utils/dates'
import { getTodayBoundary } from '../utils/today-date'
import type { HabitResolution } from '../utils/habit-list-progress'

export interface BulkActionsOptions {
  selectedHabitIds: Set<string>
  selectedDateStr: string
  completionReadOnly: boolean
  accountTimeZone?: string | null
  habitsById: Map<string, NormalizedHabit>
  habitListRef: { current: { settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void } | null }
  onSuccess: () => void
  onPartialFailure: (failedIds: string[]) => void
}

export interface BulkResultItem { status: string; habitId: string }

export function isBulkCompletionAllowed(
  currentPermission: { completionReadOnly: boolean; selectedDateStr: string },
  date: string,
  accountTimeZone: string | null | undefined,
): boolean {
  if (currentPermission.completionReadOnly || currentPermission.selectedDateStr !== date) return false
  return accountTimeZone === undefined || getTodayBoundary(date, formatAPIDateInTimeZone(new Date(), accountTimeZone)) !== 'read-only'
}
