import { describe, it, expect } from 'vitest'
import { differenceInCalendarDays } from 'date-fns'
import {
  buildCalendarRangeModel,
  CALENDAR_MONTH_MAX_RANGE_DAYS,
  MAX_RANGE_DAYS,
  resolveCalendarRangeEnd,
  splitCalendarMonthRange,
} from '../utils/calendar-range'
import { formatAPIDate, parseAPIDate } from '../utils/dates'
import type { CalendarDayEntry } from '../types/calendar'

function entry(status: CalendarDayEntry['status'], habitId = 'habit'): CalendarDayEntry {
  return { habitId, title: 'Habit', status, isBadHabit: false, dueTime: null, isOneTime: false }
}

describe('buildCalendarRangeModel', () => {
  it('builds fourteen read-only day models and derives all three figures from them', () => {
    expect(MAX_RANGE_DAYS).toBe(14)

    const dayMap = new Map<string, CalendarDayEntry[]>([
      ['2026-06-01', [entry('completed')]],
      ['2026-06-02', [entry('completed')]],
      ['2026-06-03', [entry('completed'), entry('completed', 'second'), entry('missed', 'missed')]],
    ])

    const model = buildCalendarRangeModel(
      parseAPIDate('2026-06-14'),
      dayMap,
      1,
      '2026-06-14',
    )

    expect(model.startKey).toBe('2026-06-01')
    expect(model.endKey).toBe('2026-06-14')
    expect(model.days).toHaveLength(14)
    expect(model.leadingEmptyDays).toBe(0)
    expect(model.stats).toEqual({ totalLogs: 4, missed: 1, bestStreak: 3, hasEntries: true })
  })

  it('uses today explicitly and excludes later days from the figures', () => {
    const dayMap = new Map<string, CalendarDayEntry[]>([
      ['2026-06-15', [entry('completed')]],
    ])

    const model = buildCalendarRangeModel(
      parseAPIDate('2026-06-20'),
      dayMap,
      0,
      '2026-06-14',
    )

    expect(model.leadingEmptyDays).toBe(0)
    expect(model.stats).toEqual({ totalLogs: 0, missed: 0, bestStreak: 0, hasEntries: false })
  })

  it('pages by one complete fourteen-day span', () => {
    expect(formatAPIDate(resolveCalendarRangeEnd(parseAPIDate('2026-06-14'), -1))).toBe('2026-05-31')
    expect(formatAPIDate(resolveCalendarRangeEnd(parseAPIDate('2026-06-14'), 1))).toBe('2026-06-28')
  })
})

describe('splitCalendarMonthRange', () => {
  it('pins the endpoint cap at 62 days', () => {
    expect(CALENDAR_MONTH_MAX_RANGE_DAYS).toBe(62)
  })

  it('returns a single chunk for a range within the cap', () => {
    expect(splitCalendarMonthRange('2025-06-01', '2025-06-30')).toEqual([
      { from: '2025-06-01', to: '2025-06-30' },
    ])
  })

  it('returns a single chunk for an exactly-62-day span', () => {
    expect(splitCalendarMonthRange('2025-01-01', '2025-03-04')).toEqual([
      { from: '2025-01-01', to: '2025-03-04' },
    ])
  })

  it('returns a single chunk for a same-day range', () => {
    expect(splitCalendarMonthRange('2025-06-05', '2025-06-05')).toEqual([
      { from: '2025-06-05', to: '2025-06-05' },
    ])
  })

  it('splits a contiguous, gap-free, non-overlapping quarter span', () => {
    const chunks = splitCalendarMonthRange('2026-04-03', '2026-07-03')
    expect(chunks[0]!.from).toBe('2026-04-03')
    expect(chunks.at(-1)!.to).toBe('2026-07-03')
    for (let i = 1; i < chunks.length; i += 1) {
      expect(
        differenceInCalendarDays(
          parseAPIDate(chunks[i]!.from),
          parseAPIDate(chunks[i - 1]!.to),
        ),
      ).toBe(1)
    }
  })

  it.each([
    ['quarter', '2026-04-03', '2026-07-03'],
    ['year', '2025-07-03', '2026-07-03'],
    ['two years', '2024-01-01', '2026-01-01'],
  ])('keeps every %s chunk within the 62-day cap', (_label, from, to) => {
    for (const chunk of splitCalendarMonthRange(from, to)) {
      const span = differenceInCalendarDays(
        parseAPIDate(chunk.to),
        parseAPIDate(chunk.from),
      )
      expect(span).toBeGreaterThanOrEqual(0)
      expect(span).toBeLessThanOrEqual(CALENDAR_MONTH_MAX_RANGE_DAYS)
    }
  })
})
