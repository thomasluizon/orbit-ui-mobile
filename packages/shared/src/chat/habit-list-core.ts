import type { HabitListCardItem } from '../types/chat'
import type { NormalizedHabit } from '../types/habit'
import { getAccountDay } from '../utils/dates'
import { daySummaryLogControl, habitReadStatusKey } from './day-summary-core'
import type { ReadActionScope } from './read-block-session-core'

export function habitListOccurrenceFilters(date: string): { dateFrom: string; dateTo: string; includeGeneral: boolean; includeOverdue: boolean } {
  return { dateFrom: date, dateTo: date, includeGeneral: true, includeOverdue: true }
}

export function habitListReadControl(habit: NormalizedHabit | undefined, status: HabitListCardItem['status'], date: string, scope?: ReadActionScope): ReturnType<typeof daySummaryLogControl> {
  return daySummaryLogControl(habit, status === 'overdue', scope ? {
    ...scope, date, today: getAccountDay(new Date(), scope.timeZone),
  } : undefined)
}

export function habitListSnapshotStatusKey(item: HabitListCardItem, queryBound: boolean): string | undefined {
  const statusKey = habitReadStatusKey(item.status, item.isBadHabit)
  return queryBound && statusKey ? statusKey : item.status === 'overdue' ? 'chat.habitList.overdue' : undefined
}

export function habitListRowState(item: HabitListCardItem, occurrence: NormalizedHabit | undefined, queryBound: boolean, date: string, pending: boolean, scope?: ReadActionScope): {
  control: ReturnType<typeof daySummaryLogControl>; logged: boolean; unavailable: boolean; snapshotStatusKey: string | undefined
} {
  const control = habitListReadControl(occurrence, item.status, date, scope)
  return {
    control, logged: control.logged,
    unavailable: pending || control.undoUnavailable || !control.writeAllowed,
    snapshotStatusKey: habitListSnapshotStatusKey(item, queryBound),
  }
}
