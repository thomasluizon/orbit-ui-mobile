import { describe, expect, it } from 'vitest'
import type { HabitLog } from '../types/calendar'
import type { CalendarMonthResponse } from '../types/habit'
import {
  optimisticSetCalendarHabitLog,
  rollbackOptimisticCalendarHabitLog,
  rollbackOptimisticHabitLogs,
} from '../utils/habits'

const date = '2025-01-15'
const createdAtUtc = '2025-01-15T09:30:00Z'

function makeCalendar(logs: HabitLog[]): CalendarMonthResponse {
  return { habits: [], logs: { 'habit-1': logs } }
}

describe('calendar habit cache updates', () => {
  it('applies explicit log and unlog intents without toggling matching state', () => {
    const emptyCalendar = makeCalendar([])
    const loggedCalendar = optimisticSetCalendarHabitLog(
      emptyCalendar,
      'habit-1',
      date,
      true,
      'optimistic-log-1',
      createdAtUtc,
    )

    expect(loggedCalendar.logs['habit-1']).toEqual([{
      id: 'optimistic-log-1',
      date,
      value: 1,
      createdAtUtc,
    }])
    expect(optimisticSetCalendarHabitLog(
      loggedCalendar,
      'habit-1',
      date,
      true,
      'optimistic-log-2',
      createdAtUtc,
    )).toBe(loggedCalendar)
    expect(optimisticSetCalendarHabitLog(
      loggedCalendar,
      'habit-1',
      date,
      false,
      'optimistic-log-1',
      createdAtUtc,
    ).logs['habit-1']).toEqual([])
  })

  it('rolls back only its own calendar patch', () => {
    const firstPatch: HabitLog = {
      id: 'optimistic-log-1',
      date,
      value: 1,
      createdAtUtc,
    }
    const laterPatch: HabitLog = {
      id: 'optimistic-log-2',
      date,
      value: 1,
      createdAtUtc: '2025-01-15T09:31:00Z',
    }

    const rolledBack = rollbackOptimisticCalendarHabitLog(
      makeCalendar([firstPatch, laterPatch]),
      makeCalendar([]),
      'habit-1',
      date,
      firstPatch.id,
    )

    expect(rolledBack.logs['habit-1']).toEqual([laterPatch])
  })

  it('restores a removed server log unless a later active log replaced it', () => {
    const serverLog: HabitLog = {
      id: 'server-log-1',
      date,
      value: 1,
      createdAtUtc,
    }
    const laterLog: HabitLog = {
      id: 'server-log-2',
      date,
      value: 1,
      createdAtUtc: '2025-01-15T09:31:00Z',
    }

    expect(rollbackOptimisticHabitLogs([], [serverLog], date, 'optimistic-log-1'))
      .toEqual([serverLog])
    expect(rollbackOptimisticHabitLogs([laterLog], [serverLog], date, 'optimistic-log-1'))
      .toEqual([laterLog])
    expect(rollbackOptimisticHabitLogs(undefined, [serverLog], date, 'optimistic-log-1'))
      .toBeUndefined()
  })
})
