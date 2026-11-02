import { describe, it, expect } from 'vitest'
import { computeHabitReorderPositions, type ReorderableHabitItem } from '../utils/habits'

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

  it('moves the dragged habit to the target index and renumbers its siblings', () => {
    const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
    const habitsById = new Map(items.map((i) => [i.id, i]))

    const positions = computeHabitReorderPositions(
      items,
      0,
      2,
      habitsById,
      () => [],
    )

    expect(Object.fromEntries(positions.map(({ habitId, position }) => [habitId, position]))).toEqual({ a: 2, b: 0, c: 1 })
  })

  it('handles moving from last to first position', () => {
    const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
    const habitsById = new Map(items.map((i) => [i.id, i]))

    const positions = computeHabitReorderPositions(
      items,
      2,
      0,
      habitsById,
      () => [],
    )

    expect(Object.fromEntries(positions.map(({ habitId, position }) => [habitId, position]))).toEqual({ a: 1, b: 2, c: 0 })
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

    expect(positions).toHaveLength(3)
    const posValues = positions.map((p) => p.position).sort((a, b) => a - b)
    for (let i = 0; i < posValues.length; i++) {
      expect(posValues[i]).toBe(i)
    }
  })
})
