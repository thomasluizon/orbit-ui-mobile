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

  describe('with an expanded parent above the drop (sub-habit rows in the flat list)', () => {
    function buildExpandedForest() {
      const bad = createMockHabit({ id: 'bad', position: 0 })
      const cheat = createMockHabit({ id: 'cheat', parentId: 'bad', position: 0 })
      const skip = createMockHabit({ id: 'skip', parentId: 'bad', position: 1 })
      const generic = createMockHabit({ id: 'generic', position: 1 })
      const siriane = createMockHabit({ id: 'siriane', position: 2 })
      const items = [bad, cheat, skip, generic, siriane].map((habit) => ({
        id: habit.id,
        parentId: habit.parentId,
        position: habit.position,
      }))
      const habitsById = new Map(
        [bad, cheat, skip, generic, siriane].map((habit) => [habit.id, habit]),
      )
      const getChildren = (parentId: string) =>
        parentId === 'bad' ? [cheat, skip] : []
      return { items, habitsById, getChildren }
    }

    it('keeps a top-level habit at top level when the drop anchor is a sub-habit', () => {
      const { items, habitsById, getChildren } = buildExpandedForest()

      const positions = computeHabitReorderPositions(items, 4, 2, habitsById, getChildren)
      const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))

      expect(byId).toEqual({ bad: 0, siriane: 1, generic: 2 })
      expect(byId).not.toHaveProperty('cheat')
      expect(byId).not.toHaveProperty('skip')
    })

    it('drops a top-level habit above its sibling when the anchor is that sibling', () => {
      const { items, habitsById, getChildren } = buildExpandedForest()

      const positions = computeHabitReorderPositions(items, 4, 3, habitsById, getChildren)
      const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))

      expect(byId).toEqual({ bad: 0, siriane: 1, generic: 2 })
    })
  })

  it('preserves hidden siblings\' relative position when reordering a filtered view', () => {
    const visibleA = createMockHabit({ id: 'visible-a', position: 0 })
    const hidden = createMockHabit({ id: 'hidden', position: 1 })
    const visibleB = createMockHabit({ id: 'visible-b', position: 2 })
    const items = [visibleA, visibleB].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
    }))
    const habitsById = new Map(
      [visibleA, hidden, visibleB].map((habit) => [habit.id, habit]),
    )

    const positions = computeHabitReorderPositions(items, 1, 0, habitsById, () => [])

    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))
    expect(byId['visible-b']).toBe(0)
    expect(byId['visible-a']).toBe(1)
    expect(byId['hidden']).toBe(2)
  })

  it('keeps hidden siblings anchored when dragging within a filtered view repeatedly (no drift)', () => {
    const wakingUp = createMockHabit({ id: 'waking-up', position: 0 })
    const water = createMockHabit({ id: 'water', position: 1 })
    const meals = createMockHabit({ id: 'meals', position: 2 })
    const habitsById = new Map(
      [wakingUp, water, meals].map((habit) => [habit.id, habit]),
    )

    const items = [water, meals].map((habit) => ({
      id: habit.id,
      parentId: habit.parentId,
      position: habit.position,
    }))

    const positions = computeHabitReorderPositions(items, 1, 0, habitsById, () => [])
    const byId = Object.fromEntries(positions.map((p) => [p.habitId, p.position]))

    expect(byId['waking-up']).toBe(0)
    expect(byId['meals']!).toBeLessThan(byId['water']!)
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
