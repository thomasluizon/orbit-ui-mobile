import { describe, it, expect } from 'vitest'
import { hasHabitScheduleOnDate, computeHabitReorderPositions, type ReorderableHabitItem } from '../utils/habits'

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
    // Empty arrays should fall through to dueDate check
    expect(
      hasHabitScheduleOnDate(
        { scheduledDates: [], instances: [], dueDate: '2025-01-15' },
        '2025-01-15',
      ),
    ).toBe(true)
  })
})

describe('computeHabitReorderPositions', () => {
  function makeItem(id: string, position: number, parentId: string | null = null): ReorderableHabitItem {
    return { id, position, parentId }
  }

  it('returns empty array when oldIndex equals newIndex', () => {
    const items = [makeItem('a', 0), makeItem('b', 1)]
    const habitsById = new Map(items.map((i) => [i.id, i]))
    expect(computeHabitReorderPositions(items, 0, 0, habitsById, () => [])).toEqual([])
  })

  it('returns empty array for out of bounds indices', () => {
    const items = [makeItem('a', 0)]
    const habitsById = new Map(items.map((i) => [i.id, i]))
    expect(computeHabitReorderPositions(items, -1, 0, habitsById, () => [])).toEqual([])
    expect(computeHabitReorderPositions(items, 0, 5, habitsById, () => [])).toEqual([])
  })

  it('reorders items within the same parent', () => {
    const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
    const habitsById = new Map(items.map((i) => [i.id, i]))

    const positions = computeHabitReorderPositions(
      items,
      0, // move 'a' from index 0
      2, // to index 2
      habitsById,
      () => [],
    )

    expect(positions.length).toBeGreaterThan(0)
    // 'a' should have a higher position now
    const aPos = positions.find((p) => p.habitId === 'a')
    expect(aPos).toBeDefined()
  })

  it('handles moving from last to first position', () => {
    const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
    const habitsById = new Map(items.map((i) => [i.id, i]))

    const positions = computeHabitReorderPositions(
      items,
      2, // move 'c' from last
      0, // to first
      habitsById,
      () => [],
    )

    expect(positions.length).toBeGreaterThan(0)
    const cPos = positions.find((p) => p.habitId === 'c')
    expect(cPos?.position).toBe(0)
  })

  it('produces contiguous 0-based positions', () => {
    const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
    const habitsById = new Map(items.map((i) => [i.id, i]))

    const positions = computeHabitReorderPositions(
      items,
      0,
      1,
      habitsById,
      () => [],
    )

    const posValues = positions.map((p) => p.position).sort((a, b) => a - b)
    for (let i = 0; i < posValues.length; i++) {
      expect(posValues[i]).toBe(i)
    }
  })
})
