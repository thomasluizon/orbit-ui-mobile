import type { HabitStatus } from '../contracts/lists'

export function resolveHabitAccessibleStatus(status: HabitStatus, isDoneForRange: boolean): HabitStatus {
  return status === 'bad' && !isDoneForRange ? 'empty' : status
}
