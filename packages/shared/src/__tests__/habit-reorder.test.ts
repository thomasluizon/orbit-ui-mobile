import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { computeHabitReorderPositions } from '../utils/habits'

describe('computeHabitReorderPositions', () => {
  it('reorders top-level habits', () => {
    const habitA = createMockHabit({ id: 'a', position: 0 })
    const habitB = createMockHabit({ id: 'b', position: 1 })
    const habitC = createMockHabit({ id: 'c', position: 2 })
    const items = [habitA, habitB, habitC].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
    }))
    const habitsById = new Map([habitA, habitB, habitC].map((habit) => [habit.id, habit]))

    const positions = computeHabitReorderPositions(items, 2, 0, habitsById, () => [])

    expect(positions).toEqual([
      { habitId: 'c', position: 0 },
      { habitId: 'a', position: 1 },
      { habitId: 'b', position: 2 },
    ])
  })

  it('reorders child habits within the same parent', () => {
    const parent = createMockHabit({ id: 'parent' })
    const childA = createMockHabit({ id: 'child-a', parentId: 'parent', position: 0 })
    const childB = createMockHabit({ id: 'child-b', parentId: 'parent', position: 1 })
    const childC = createMockHabit({ id: 'child-c', parentId: 'parent', position: 2 })
    const items = [childA, childB, childC].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
    }))
    const habitsById = new Map(
      [parent, childA, childB, childC].map((habit) => [habit.id, habit]),
    )

    const positions = computeHabitReorderPositions(
      items,
      0,
      2,
      habitsById,
      (parentId) => (parentId === 'parent' ? [childA, childB, childC] : []),
    )

    expect(positions).toEqual([
      { habitId: 'child-b', position: 0 },
      { habitId: 'child-c', position: 1 },
      { habitId: 'child-a', position: 2 },
    ])
  })

  it('appends hidden siblings after visible ones', () => {
    const visibleA = createMockHabit({ id: 'visible-a', position: 0 })
    const hidden = createMockHabit({ id: 'hidden', position: 1 })
    const visibleB = createMockHabit({ id: 'visible-b', position: 2 })
    const items = [visibleA, visibleB].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
    }))
    const habitsById = new Map(
      [visibleA, hidden, visibleB].map((habit) => [habit.id, habit]),
    )

    const positions = computeHabitReorderPositions(items, 1, 0, habitsById, () => [])

    expect(positions).toEqual([
      { habitId: 'visible-b', position: 0 },
      { habitId: 'visible-a', position: 1 },
      { habitId: 'hidden', position: 2 },
    ])
  })

  it('returns an empty list for invalid indices', () => {
    const habit = createMockHabit({ id: 'habit-1' })
    const items = [{ id: habit.id, parentId: habit.parentId }]
    const habitsById = new Map([[habit.id, habit]])

    expect(computeHabitReorderPositions(items, -1, 0, habitsById, () => [])).toEqual([])
    expect(computeHabitReorderPositions(items, 0, 2, habitsById, () => [])).toEqual([])
  })
})
