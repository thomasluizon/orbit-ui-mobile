import { describe, it, expect } from 'vitest'
import { hasHabitScheduleOnDate, buildUnresolvedBulkFailures } from '../utils/habits'

it('marks every unresolved bulk item with its original index and failure reason', () => {
  expect(buildUnresolvedBulkFailures(['A', 'B'], 3, new Error('offline'),
    (title, index, error) => ({ title, index, error }))).toEqual([
    { title: 'A', index: 3, error: 'offline' },
    { title: 'B', index: 4, error: 'offline' },
  ])
})

describe('hasHabitScheduleOnDate', () => {
  it('returns true when date is in scheduledDates', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: ['2025-01-15', '2025-01-16'], instances: null, dueDate: null },
        '2025-01-15',
      ),
    ).toBe(true)
  })

  it('returns false when date is not in scheduledDates', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: ['2025-01-15'], instances: null, dueDate: null },
        '2025-01-16',
      ),
    ).toBe(false)
  })

  it('returns true when date matches an instance date', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: null, instances: [{ date: '2025-01-15' }], dueDate: null },
        '2025-01-15',
      ),
    ).toBe(true)
  })

  it('returns false when date does not match any instance', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: null, instances: [{ date: '2025-01-14' }], dueDate: null },
        '2025-01-15',
      ),
    ).toBe(false)
  })

  it('falls back to dueDate when no scheduledDates or instances', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: null, instances: null, dueDate: '2025-01-15' },
        '2025-01-15',
      ),
    ).toBe(true)
  })

  it('returns false with dueDate fallback on different date', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: null, instances: null, dueDate: '2025-01-14' },
        '2025-01-15',
      ),
    ).toBe(false)
  })

  it('does not fall back to dueDate when scheduledDates is populated', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: ['2025-01-14'], instances: null, dueDate: '2025-01-15' },
        '2025-01-15',
      ),
    ).toBe(false)
  })

  it('prefers scheduledDates over dueDate', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: ['2025-01-15'], instances: null, dueDate: '2025-01-16' },
        '2025-01-15',
      ),
    ).toBe(true)
  })

  it('handles empty arrays for scheduledDates and instances', () => {
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: [], instances: [], dueDate: '2025-01-15' },
        '2025-01-15',
      ),
    ).toBe(true)
  })
})
