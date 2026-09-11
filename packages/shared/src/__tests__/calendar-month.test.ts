import { describe, expect, it } from 'vitest'
import type { CalendarDayEntry } from '../types/calendar'
import { buildCalendarMonthModel } from '../utils/calendar-month'
import { formatAPIDate } from '../utils/dates'
import { resolveCalendarMonthDisplayState } from '../utils/calendar-month-state'

function entry(status: CalendarDayEntry['status'], habitId = 'h'): CalendarDayEntry {
  return { habitId, title: 't', status, isBadHabit: false, dueTime: null, isOneTime: false }
}

const june = new Date(2026, 5, 1)
const key = (date: Date) => formatAPIDate(date)

function sampleMonth(): Map<string, CalendarDayEntry[]> {
  return new Map<string, CalendarDayEntry[]>([
    [key(new Date(2026, 5, 1)), [entry('completed'), entry('completed', 'h2')]],
    [key(new Date(2026, 5, 2)), [entry('completed')]],
    [key(new Date(2026, 5, 3)), [entry('completed'), entry('missed', 'h2')]],
    [key(new Date(2026, 5, 5)), [entry('completed')]],
  ])
}

describe('buildCalendarMonthModel', () => {
  it('computes statistics from only the current month', () => {
    const dayMap = sampleMonth()
    dayMap.set(key(new Date(2026, 4, 31)), [entry('completed')])

    expect(buildCalendarMonthModel(june, dayMap, 1).monthStats).toEqual({
      totalLogs: 5,
      missed: 1,
      bestStreak: 2,
      hasEntries: true,
    })
  })

  it('builds whole weeks with counts and ratios', () => {
    const { gridDays } = buildCalendarMonthModel(june, sampleMonth(), 1)
    const june1 = gridDays.find((day) => day.dateStr === key(new Date(2026, 5, 1)))

    expect(gridDays.length % 7).toBe(0)
    expect(gridDays.filter((day) => day.isCurrentMonth)).toHaveLength(30)
    expect(june1).toMatchObject({
      isCurrentMonth: true,
      completedCount: 2,
      totalCount: 2,
      completionRatio: 1,
    })
  })

  it('supports Sunday-first weeks and an empty month', () => {
    const model = buildCalendarMonthModel(june, new Map(), 0)

    expect(model.gridDays[0]?.date.getDay()).toBe(0)
    expect(model.monthStats.hasEntries).toBe(false)
  })
})

describe('resolveCalendarMonthDisplayState', () => {
  const currentMonth = new Date(2026, 5, 1)
  const today = '2026-06-15'

  it('gives loading priority while data is unresolved', () => {
    expect(resolveCalendarMonthDisplayState({
      currentMonth,
      today,
      hasEntries: false,
      isLoading: true,
    })).toBe('loading')
  })

  it('separates empty, future, and ready months', () => {
    expect(resolveCalendarMonthDisplayState({
      currentMonth,
      today,
      hasEntries: false,
      isLoading: false,
    })).toBe('empty')
    expect(resolveCalendarMonthDisplayState({
      currentMonth: new Date(2026, 6, 1),
      today,
      hasEntries: false,
      isLoading: false,
    })).toBe('future')
    expect(resolveCalendarMonthDisplayState({
      currentMonth,
      today,
      hasEntries: true,
      isLoading: false,
    })).toBe('ready')
  })
})
