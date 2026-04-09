import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { computeHabitReorderPositions } from '../utils/habits'

describe('computeHabitReorderPositions', () => {
  it('reorders top-level habits and emits contiguous 0..N-1 positions', () => {
    const habitA = createMockHabit({ id: 'a', position: 0 })
    const habitB = createMockHabit({ id: 'b', position: 1 })
    const habitC = createMockHabit({ id: 'c', position: 2 })
    const items = [habitA, habitB, habitC].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
    }))
    const habitsById = new Map([habitA, habitB, habitC].map((habit) => [habit.id, habit]))

    const positions = computeHabitReorderPositions(items, 2, 0, habitsById, () => [])

    // c moved to front: [c, a, b]
    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))
    expect(byId).toEqual({ c: 0, a: 1, b: 2 })
  })

  it('reorders child habits within the same parent', () => {
    const parent = createMockHabit({ id: 'parent', position: 0 })
    const childA = createMockHabit({ id: 'child-a', parentId: 'parent', position: 0 })
    const childB = createMockHabit({ id: 'child-b', parentId: 'parent', position: 1 })
    const childC = createMockHabit({ id: 'child-c', parentId: 'parent', position: 2 })
    const items = [childA, childB, childC].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
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

    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))
    expect(byId).toEqual({ 'child-b': 0, 'child-c': 1, 'child-a': 2 })
  })

  it('preserves hidden siblings\' relative position when reordering a filtered view', () => {
    const visibleA = createMockHabit({ id: 'visible-a', position: 0 })
    const hidden = createMockHabit({ id: 'hidden', position: 1 })
    const visibleB = createMockHabit({ id: 'visible-b', position: 2 })
    // Only visibleA and visibleB appear in the Today view (hidden is filtered out).
    const items = [visibleA, visibleB].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
    }))
    const habitsById = new Map(
      [visibleA, hidden, visibleB].map((habit) => [habit.id, habit]),
    )

    // Swap visibleA and visibleB in the filtered view.
    const positions = computeHabitReorderPositions(items, 1, 0, habitsById, () => [])

    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))
    // Expected full order: [visibleB, visibleA, hidden] -- hidden stays between/after them,
    // but critically it MUST NOT be pushed to the end index > visible count. Because the
    // anchor for newIndex=0 is no "before" item and the "after" anchor is visibleA (pos 0
    // in full list after removing visibleB), visibleB inserts at 0 -> [visibleB, visibleA, hidden].
    expect(byId['visible-b']).toBe(0)
    expect(byId['visible-a']).toBe(1)
    expect(byId['hidden']).toBe(2)
  })

  it('keeps hidden siblings anchored when dragging within a filtered view repeatedly (no drift)', () => {
    // Simulate the bug: the user drags twice in a filtered view. The hidden habit
    // must not drift to a higher index each time.
    const wakingUp = createMockHabit({ id: 'waking-up', position: 0 })
    const water = createMockHabit({ id: 'water', position: 1 })
    const meals = createMockHabit({ id: 'meals', position: 2 })
    const habitsById = new Map(
      [wakingUp, water, meals].map((habit) => [habit.id, habit]),
    )

    // Only water and meals visible today (waking-up already done & filtered out).
    const items = [water, meals].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
    }))

    // Drag meals above water.
    const positions = computeHabitReorderPositions(items, 1, 0, habitsById, () => [])
    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))

    // waking-up MUST stay at position 0 (it's the first in the full list and
    // was not dragged). The visible swap should land around it.
    expect(byId['waking-up']).toBe(0)
    // meals should now be before water in the full order.
    expect(byId['meals']!).toBeLessThan(byId['water']!)
    // All positions must form a contiguous 0..2 set.
    expect(new Set(Object.values(byId))).toEqual(new Set([0, 1, 2]))
  })

  it('returns an empty list for invalid indices or no-op moves', () => {
    const habit = createMockHabit({ id: 'habit-1' })
    const items = [{ id: habit.id, parentId: habit.parentId, position: habit.position }]
    const habitsById = new Map([[habit.id, habit]])

    expect(computeHabitReorderPositions(items, -1, 0, habitsById, () => [])).toEqual([])
    expect(computeHabitReorderPositions(items, 0, 2, habitsById, () => [])).toEqual([])
    expect(computeHabitReorderPositions(items, 0, 0, habitsById, () => [])).toEqual([])
  })
})
