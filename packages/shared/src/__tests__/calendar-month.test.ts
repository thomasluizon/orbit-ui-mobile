import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDayEntry } from '../types/calendar'
import { buildCalendarMonthModel } from '../utils/calendar-month'
import { formatAPIDate } from '../utils/dates'

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
  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes statistics from only the current month', () => {
    const dayMap = sampleMonth()
    dayMap.set(key(new Date(2026, 4, 31)), [entry('completed')])

    expect(buildCalendarMonthModel(june, dayMap, 1).monthStats).toEqual({
      totalLogs: 5,
      missed: 1,
      bestStreak: 4,
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
    expect(model.monthStats).toEqual({
      totalLogs: 0,
      missed: 0,
      bestStreak: 0,
      hasEntries: false,
    })
  })

  it('computes tile counts from scheduled days through today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 17, 12))
    const august = new Date(2026, 7, 1)
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [key(new Date(2026, 7, 1)), [entry('completed'), entry('completed', 'h2')]],
      [key(new Date(2026, 7, 3)), [entry('completed'), entry('missed', 'h2')]],
      [key(new Date(2026, 7, 4)), [entry('missed')]],
      [key(new Date(2026, 7, 5)), [entry('completed')]],
      [key(new Date(2026, 7, 17)), [entry('completed'), entry('upcoming', 'h2')]],
      [key(new Date(2026, 7, 18)), [entry('completed')]],
    ])

    expect(buildCalendarMonthModel(august, dayMap, 1).monthStats).toEqual({
      totalLogs: 5,
      missed: 3,
      bestStreak: 2,
      hasEntries: true,
    })
  })
})
