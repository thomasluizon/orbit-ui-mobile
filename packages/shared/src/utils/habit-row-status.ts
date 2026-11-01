import type { HabitStatus } from '../contracts/lists'
import type { NormalizedHabit } from '../types/habit'
import { isHabitSkippedOnDate } from './all-done'
import { canLogHabitOnDate } from './habit-card-helpers'
import { hasHabitScheduleOnDate } from './habits'
import { getTodayBoundary } from './today-date'

function getHabitRowDateStatusKey(
  habit: NormalizedHabit,
  date: string,
  today: string,
): 'habits.statusDot.skip' | 'calendar.dayCell.notScheduled' | undefined {
  if (isHabitSkippedOnDate(habit, date)) return 'habits.statusDot.skip'
  if (!habit.isCompleted && !habit.isLoggedInRange && !canLogHabitOnDate(habit, date, today)
    && !hasHabitScheduleOnDate(habit, date) && habit.dueDate > date) return 'calendar.dayCell.notScheduled'
  return undefined
}

export function buildHabitRowDateModel(habit: NormalizedHabit, date: string | undefined, today: string): {
  canLog: boolean
  dateStatusKey: ReturnType<typeof getHabitRowDateStatusKey>
  completionReasonKey: ReturnType<typeof getHabitRowDateStatusKey> | 'habits.todayBoundary.readOnly' | 'habits.todayBoundary.future'
  completionStatusUnavailable: boolean
  completionReadOnly: boolean
} {
  const canLog = date === undefined || canLogHabitOnDate(habit, date, today)
  const dateStatusKey = date === undefined ? undefined : getHabitRowDateStatusKey(habit, date, today)
  const boundary = date === undefined ? null : getTodayBoundary(date, today)
  const completionReasonKey = dateStatusKey
    ?? (boundary === 'read-only' ? 'habits.todayBoundary.readOnly' : boundary === 'future' ? 'habits.todayBoundary.future' : undefined)
  return {
    canLog,
    dateStatusKey,
    completionReasonKey,
    completionStatusUnavailable: dateStatusKey !== undefined,
    completionReadOnly: dateStatusKey !== undefined || boundary === 'read-only' || (boundary === 'future' && !canLog),
  }
}

export const HABIT_CHECK_PATH = 'M14 .5H16A11.5 11.5 0 0 1 27.5 12V16A11.5 11.5 0 0 1 16 27.5H12A11.5 11.5 0 0 1 .5 16V12A11.5 11.5 0 0 1 12 .5Z'
export const HABIT_CHECK_PERIMETER = 16 + 23 * Math.PI

export function habitCheckProgress(progress?: { done: number; total: number }): number {
  return progress && progress.total > 0 ? Math.min(Math.max(progress.done / progress.total, 0), 1) : 0
}

export function resolveHabitAccessibleStatus(status: HabitStatus, isDoneForRange: boolean): HabitStatus {
  return status === 'bad' && !isDoneForRange ? 'empty' : status
}
