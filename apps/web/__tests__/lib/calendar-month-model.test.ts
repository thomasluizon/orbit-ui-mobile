import { describe, it, expect } from 'vitest'
import { buildCalendarMonthModel } from '@/lib/calendar-month-model'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

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
