import type { HabitStatus } from '../contracts/lists'

export const HABIT_CHECK_PATH = 'M14 .5H16A11.5 11.5 0 0 1 27.5 12V16A11.5 11.5 0 0 1 16 27.5H12A11.5 11.5 0 0 1 .5 16V12A11.5 11.5 0 0 1 12 .5Z'
export const HABIT_CHECK_PERIMETER = 16 + 23 * Math.PI

export function habitCheckProgress(progress?: { done: number; total: number }): number {
  return progress && progress.total > 0 ? Math.min(Math.max(progress.done / progress.total, 0), 1) : 0
}

export function resolveHabitAccessibleStatus(status: HabitStatus, isDoneForRange: boolean): HabitStatus {
  return status === 'bad' && !isDoneForRange ? 'empty' : status
}
