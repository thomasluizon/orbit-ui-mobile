import { describe, expect, it } from 'vitest'
import {
  CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO,
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  calendarEntryOutcome,
  orderCalendarDayEntries,
  filterRecurringDayMap,
  filterRecurringEntries,
  resolveCalendarEventsDisplayState,
} from '../utils/calendar-entries'
import type { CalendarDayEntry } from '../types/calendar'

function entry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: overrides.habitId ?? 'habit-1',
    title: overrides.title ?? 'Habit',
    status: overrides.status ?? 'upcoming',
    isBadHabit: overrides.isBadHabit ?? false,
    dueTime: overrides.dueTime ?? null,
    isOneTime: overrides.isOneTime ?? false,
  }
}

describe('filterRecurringEntries', () => {
  const recurring = entry({ habitId: 'recurring', isOneTime: false })
  const oneTime = entry({ habitId: 'one-time', isOneTime: true })

  it('returns every entry when showRecurring is on', () => {
    expect(filterRecurringEntries([recurring, oneTime], true)).toEqual([
      recurring,
      oneTime,
    ])
  })

  it('keeps only one-time entries when showRecurring is off', () => {
    expect(filterRecurringEntries([recurring, oneTime], false)).toEqual([oneTime])
  })

  it('returns an empty list when every entry is recurring and the toggle is off', () => {
    expect(filterRecurringEntries([recurring], false)).toEqual([])
  })
})

describe('calendar month controls', () => {
  it('keeps the 60px swipe boundary readable by both platforms', () => {
    expect(CALENDAR_MONTH_SWIPE_THRESHOLD).toBe(60)
  })

  it('keeps the 1.2 horizontal direction ratio readable by both platforms', () => {
    expect(CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO).toBeCloseTo(1.2)
  })

  it('filters every date before the month model derives rings and figures', () => {
    const recurring = entry({ habitId: 'recurring', isOneTime: false })
    const oneTime = entry({ habitId: 'one-time', isOneTime: true })
    const source = new Map([
      ['2026-09-10', [recurring]],
      ['2026-09-11', [recurring, oneTime]],
    ])

    expect(filterRecurringDayMap(source, false)).toEqual(new Map([
      ['2026-09-10', []],
      ['2026-09-11', [oneTime]],
    ]))
    expect(filterRecurringDayMap(source, true)).toBe(source)
  })
})

describe('calendar events display state', () => {
  it.each([false, true])('keeps unknown entitlement loading with cached Pro access %s', (enabled) => {
    expect(resolveCalendarEventsDisplayState({ profileReady: false, enabled, isPending: false, error: null, resultStatus: 'connected' })).toBe('loading')
  })

  it.each([
    ['Pro boundary', false, false, null, undefined, 'pro-boundary'],
    ['request failure', true, false, new Error('Calendar unavailable'), undefined, 'failed'],
    ['loading', true, true, null, undefined, 'loading'],
    ['disconnected account', true, false, null, 'not-connected', 'not-connected'],
    ['connected account', true, false, null, 'connected', 'ready'],
  ] as const)(
    'shows the %s state',
    (_caseName, enabled, isPending, error, resultStatus, expected) => {
      expect(resolveCalendarEventsDisplayState({
        enabled,
        isPending,
        error,
        resultStatus,
      })).toBe(expected)
    },
  )
})


describe('calendar entry outcomes', () => {
  it.each([
    ['upcoming', false, 'empty', 'upcoming'],
    ['upcoming', true, 'empty', 'upcoming'],
    ['completed', false, 'done', 'completed'],
    ['missed', false, 'empty', 'missed'],
    ['completed', true, 'bad', 'indulged'],
    ['missed', true, 'done', 'resisted'],
  ] as const)('describes %s with bad-habit=%s consistently', (status, isBadHabit, mark, label) => {
    expect(calendarEntryOutcome(entry({ status, isBadHabit }))).toEqual({ status: mark, labelKey: `calendar.status.${label}` })
  })
})

describe('orderCalendarDayEntries', () => {
  it('keeps no-time entries and time ties in API order without mutating the source', () => {
    const source = [entry({ habitId: 'late', dueTime: '21:00' }), entry({ habitId: 'first', dueTime: null }),
      entry({ habitId: 'early', dueTime: '08:00' }), entry({ habitId: 'second', dueTime: null }),
      entry({ habitId: 'tie', dueTime: '08:00' })]
    const original = [...source]
    expect(orderCalendarDayEntries(source).map((habit) => habit.habitId)).toEqual(['first', 'second', 'early', 'tie', 'late'])
    expect(source).toEqual(original)
    expect(orderCalendarDayEntries([])).toEqual([])
  })
})
