import { describe, expect, it } from 'vitest'
import { filterRecurringEntries } from '../utils/calendar-entries'
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
