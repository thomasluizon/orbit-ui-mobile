import { describe, expect, it } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  buildMoveParentOptions,
  validateMoveTarget,
} from '@/components/habits/habit-list/tree-helpers'

function buildTree(habits: NormalizedHabit[]) {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const getChildren = (habitId: string) =>
    habits.filter((habit) => habit.parentId === habitId)
  const topLevelHabits = habits.filter((habit) => habit.parentId === null)
  return { habitsById, getChildren, topLevelHabits }
}

function buildOptions(
  habits: NormalizedHabit[],
  movingHabitId: string,
  maxHabitDepth = 9,
) {
  const { habitsById, getChildren, topLevelHabits } = buildTree(habits)
  const t = (key: string) => key
  return buildMoveParentOptions(
    {
      topLevelHabits,
      getChildren,
      validateMoveTarget: (target, dragged) =>
        validateMoveTarget({ habitsById, getChildren, maxHabitDepth, t }, target, dragged),
      t,
    },
    movingHabitId,
  )
}

describe('buildMoveParentOptions', () => {
  it('hides completed one-time habits, keeps active ones, and tags emoji and child count', () => {
    const active = createMockHabit({ id: 'active', title: 'Fitness', emoji: '🏃' })
    const activeChild = createMockHabit({ id: 'active-child', parentId: 'active' })
    const done = createMockHabit({
      id: 'done',
      isCompleted: true,
      frequencyUnit: null,
    })

    const options = buildOptions([active, activeChild, done], 'mover')

    expect(options.map((option) => option.id)).toEqual([null, 'active', 'active-child'])
    const activeOption = options.find((option) => option.id === 'active')
    expect(activeOption?.emoji).toBe('🏃')
    expect(activeOption?.childCount).toBe(1)
    expect(activeOption?.depth).toBe(0)
    expect(options.find((option) => option.id === 'active-child')?.depth).toBe(1)
    expect(options.find((option) => option.id === 'active-child')?.childCount).toBe(0)
  })

  it('keeps a finished container so its active descendant is never orphaned', () => {
    const container = createMockHabit({
      id: 'container',
      isCompleted: true,
      frequencyUnit: null,
    })
    const activeChild = createMockHabit({ id: 'loose-end', parentId: 'container' })

    const options = buildOptions([container, activeChild], 'mover')

    expect(options.map((option) => option.id)).toEqual([null, 'container', 'loose-end'])
    expect(options.find((option) => option.id === 'container')?.childCount).toBe(1)
    expect(options.find((option) => option.id === 'loose-end')?.depth).toBe(1)
  })

  it('drops a finished container once its whole subtree is done', () => {
    const container = createMockHabit({
      id: 'container',
      isCompleted: true,
      frequencyUnit: null,
    })
    const doneChild = createMockHabit({
      id: 'done-child',
      parentId: 'container',
      isCompleted: true,
      frequencyUnit: null,
    })

    const options = buildOptions([container, doneChild], 'mover')

    expect(options.map((option) => option.id)).toEqual([null])
  })

  it('still disables self, descendant, and depth-exceeding targets', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent' })
    const child = createMockHabit({ id: 'child', parentId: 'parent' })
    const other = createMockHabit({ id: 'other', title: 'Other' })

    const options = buildOptions([parent, child, other], 'parent', 2)

    const optionById = (id: string | null) => options.find((option) => option.id === id)
    expect(optionById(null)?.disabled).toBe(false)
    expect(optionById('parent')?.disabled).toBe(true)
    expect(optionById('parent')?.reason).toBe('habits.moveParent.invalidSelf')
    expect(optionById('child')?.disabled).toBe(true)
    expect(optionById('child')?.reason).toBe('habits.moveParent.invalidDescendant')
    expect(optionById('other')?.disabled).toBe(true)
    expect(optionById('other')?.reason).toBe('habits.moveParent.invalidDepth')
  })
})
