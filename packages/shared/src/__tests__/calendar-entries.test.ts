import { describe, expect, it } from 'vitest'
import {
  CALENDAR_MONTH_SWIPE_THRESHOLD,
  filterRecurringDayMap,
  filterRecurringEntries,
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
