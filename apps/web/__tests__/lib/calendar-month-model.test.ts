import { describe, it, expect } from 'vitest'
import { buildCalendarMonthModel } from '@/lib/calendar-month-model'
import { buildCalendarDayMap, formatAPIDate } from '@orbit/shared/utils'
import {
  createMockHabitScheduleChild,
  createMockHabitScheduleItem,
} from '@orbit/shared/__tests__/factories'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarMonthResponse, HabitScheduleChild } from '@orbit/shared/types/habit'

function entry(status: CalendarDayEntry['status'], habitId = 'h'): CalendarDayEntry {
  return { habitId, title: 't', status, isBadHabit: false, dueTime: null, isOneTime: false }
}

const june = new Date(2026, 5, 1)
const key = (d: Date) => formatAPIDate(d)

function sampleMonth(): Map<string, CalendarDayEntry[]> {
  return new Map<string, CalendarDayEntry[]>([
    [key(new Date(2026, 5, 1)), [entry('completed'), entry('completed', 'h2')]],
    [key(new Date(2026, 5, 2)), [entry('completed')]],
    [key(new Date(2026, 5, 3)), [entry('completed'), entry('missed', 'h2')]],
    [key(new Date(2026, 5, 5)), [entry('completed')]],
  ])
}

describe('buildCalendarMonthModel (web)', () => {
  it('sums completed logs across the month', () => {
    expect(buildCalendarMonthModel(june, sampleMonth()).monthStats.totalLogs).toBe(5)
  })

  it('counts missed entries', () => {
    expect(buildCalendarMonthModel(june, sampleMonth()).monthStats.missed).toBe(1)
  })

  it('computes the best consecutive fully-completed streak', () => {
    expect(buildCalendarMonthModel(june, sampleMonth()).monthStats.bestStreak).toBe(2)
  })

  it('reports whether the month has any entries', () => {
    expect(buildCalendarMonthModel(june, sampleMonth()).monthStats.hasEntries).toBe(true)
    expect(buildCalendarMonthModel(june, new Map()).monthStats.hasEntries).toBe(false)
  })

  it('ignores entries outside the current month', () => {
    const withPrev = sampleMonth()
    withPrev.set(key(new Date(2026, 4, 31)), [entry('completed')])
    expect(buildCalendarMonthModel(june, withPrev).monthStats.totalLogs).toBe(5)
  })
})

describe('buildCalendarMonthModel with sub-habit logs (web)', () => {
  const september = new Date(2026, 8, 1)
  const loggedDate = '2026-09-28'

  function loggedChild(id: string): HabitScheduleChild {
    return createMockHabitScheduleChild({
      id,
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      dueDate: '2026-10-19',
      scheduledDates: [loggedDate],
      isLoggedInRange: true,
      instances: [{ date: loggedDate, status: 'Completed', logId: `${id}-log` }],
    })
  }

  function subHabitLogMonth(): CalendarMonthResponse {
    return {
      habits: [
        createMockHabitScheduleItem({
          id: 'flexible-parent',
          frequencyUnit: 'Year',
          isFlexible: true,
          dueDate: '2026-01-01',
          flexibleTarget: 1,
          flexibleCompleted: 1,
          children: [loggedChild('flexible-child')],
          hasSubHabits: true,
        }),
        createMockHabitScheduleItem({
          id: 'weekly-parent',
          frequencyUnit: 'Week',
          dueDate: '2026-10-05',
          scheduledDates: [loggedDate],
          isLoggedInRange: true,
          instances: [{ date: loggedDate, status: 'Completed', logId: 'parent-log' }],
          children: [loggedChild('weekly-child')],
          hasSubHabits: true,
        }),
      ],
      logs: {
        'flexible-parent': [],
        'weekly-parent': [
          { id: 'parent-log', date: loggedDate, value: 1, createdAtUtc: '2026-09-28T08:00:00Z' },
        ],
      },
    }
  }

  it('counts each sub-habit log day once per family', () => {
    const dayMap = buildCalendarDayMap(subHabitLogMonth(), new Date(2026, 8, 29, 12))
    const { monthStats } = buildCalendarMonthModel(september, dayMap)

    expect(dayMap.get(loggedDate)?.map((dayEntry) => dayEntry.habitId)).toEqual([
      'flexible-parent',
      'weekly-parent',
    ])
    expect(monthStats).toEqual({ bestStreak: 1, totalLogs: 2, missed: 0, hasEntries: true })
  })
})
