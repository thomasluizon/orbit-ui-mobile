import type { NormalizedHabit } from '../types/habit'
import type { StatusRingProps } from '../contracts/lists'
import { isHabitDoneForRange } from '../utils/habit-visibility'

export function daySummaryLogControl(habit: NormalizedHabit | undefined, overdue = false): {
  logged: boolean
  undoUnavailable: boolean
  status: NonNullable<StatusRingProps['status']>
  statusKey: string
  actionKey: string
} {
  const logged = habit ? isHabitDoneForRange(habit) : false
  const slipped = logged && habit?.isBadHabit === true
  let status: NonNullable<StatusRingProps['status']> = overdue ? 'overdue' : 'empty'
  let statusKey = 'chat.habitList.pending'
  if (logged) {
    status = 'done'
    statusKey = 'chat.habitList.logged'
  }
  if (slipped) {
    status = 'bad'
    statusKey = 'habits.statusDot.bad'
  }
  return {
    logged,
    undoUnavailable: logged && (habit?.isBadHabit === true || habit?.isFlexible === true),
    status,
    statusKey,
    actionKey: logged ? 'chat.habitList.unlog' : 'chat.habitList.log',
  }
}
