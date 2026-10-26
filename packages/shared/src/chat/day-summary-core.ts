import type { NormalizedHabit } from '../types/habit'
import type { StatusRingProps } from '../contracts/lists'
import { getHabitLogDateDecision } from '../utils/habit-card-helpers'
import { isHabitDoneForRange } from '../utils/habit-visibility'
import type { DaySummaryCard } from '../types/chat'

export function daySummaryCompletion(card: DaySummaryCard, occurrences: ReadonlyMap<string, NormalizedHabit> | undefined): { done: number; completionRate: number } {
  const delta = (card.rows ?? []).reduce((total, row) => {
    const habit = occurrences?.get(row.id)
    if (!habit || row.depth > 0 || row.isBadHabit) return total
    return total + Number(isHabitDoneForRange(habit)) - Number(row.status === 'done')
  }, 0)
  const done = Math.max(0, Math.min(card.due, card.done + delta))
  return { done, completionRate: card.due > 0 ? done / card.due * 100 : 0 }
}

export function daySummaryLogControl(habit: NormalizedHabit | undefined, overdue = false, readDate?: { date: string; today: string; timeZone: string | null; ready: boolean }): {
  logged: boolean
  undoUnavailable: boolean
  writeAllowed: boolean
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
    writeAllowed: readDate ? readDate.ready && getHabitLogDateDecision(habit, readDate.date, readDate.today, readDate.timeZone, false, logged ? 'unlog' : 'log') === 'write' : true,
    undoUnavailable: logged && (habit?.isBadHabit === true || habit?.isFlexible === true),
    status,
    statusKey,
    actionKey: logged ? 'chat.habitList.unlog' : 'chat.habitList.log',
  }
}

export function habitReadStatusKey(status: import('../types/chat').HabitListCardItem['status'], isBadHabit: boolean): string | null {
  if (status === 'done') return isBadHabit ? 'habits.statusDot.bad' : 'chat.habitList.logged'
  return status === 'overdue' ? 'chat.habitList.overdue' : null
}

export function habitSnapshotCheck(item: Pick<import('../types/chat').HabitListCardItem, 'status' | 'isBadHabit'>): {
  status: NonNullable<StatusRingProps['status']>; statusKey: string
} {
  return {
    status: item.status === 'done' ? item.isBadHabit ? 'bad' : 'done' : item.status === 'overdue' ? 'overdue' : 'empty',
    statusKey: habitReadStatusKey(item.status, item.isBadHabit) ?? 'chat.habitList.pending',
  }
}
