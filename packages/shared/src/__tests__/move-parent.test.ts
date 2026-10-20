import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import type { NormalizedHabit } from '../types/habit'
import {
  buildMoveParentOptions,
  getMoveParentPickerRows,
  getMoveParentSelection,
  getMoveParentRowAvailability,
  getMoveParentScrollOffset,
  getSharedMoveParentId,
  validateMoveTarget,
} from '../utils/move-parent'

function buildTree(habits: NormalizedHabit[]) {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const getChildren = (habitId: string) =>
    habits.filter((habit) => habit.parentId === habitId)
  const topLevelHabits = habits.filter((habit) => habit.parentId === null)
  return { habitsById, getChildren, topLevelHabits }
}

function buildOptions(
  habits: NormalizedHabit[],
  movingHabitId: string | readonly string[],
  maxHabitDepth = 9,
) {
  const { habitsById, getChildren, topLevelHabits } = buildTree(habits)
  const t = (key: string) => key
  return buildMoveParentOptions(
    {
      topLevelHabits,
      habitsById,
      maxHabitDepth,
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
    expect(optionById(null)?.disabled).toBe(true)
    expect(optionById('parent')?.disabled).toBe(true)
    expect(optionById('parent')?.reason).toBe('habits.moveParent.invalidSelf')
    expect(optionById('child')?.disabled).toBe(true)
    expect(optionById('child')?.reason).toBe('habits.moveParent.invalidDescendant')
    expect(optionById('other')?.disabled).toBe(true)
    expect(optionById('other')?.reason).toBe('habits.moveParent.invalidDepth')
  })
})


describe('move selection destinations', () => {
  it('has no shared parent for a mixed selection and retains the root for top-level habits', () => {
    const habits = [createMockHabit({ id: 'root' }), createMockHabit({ id: 'nested', parentId: 'root' })]
    const { habitsById } = buildTree(habits)
    expect(getSharedMoveParentId(habitsById, ['root', 'nested'])).toBeUndefined()
    expect(getSharedMoveParentId(habitsById, ['root'])).toBeNull()
    expect(getSharedMoveParentId(habitsById, [])).toBeUndefined()
  })

  it('disables the current parent with a reason while accepting another destination', () => {
    const parent = createMockHabit({ id: 'parent' })
    const source = createMockHabit({ id: 'source', parentId: parent.id })
    const other = createMockHabit({ id: 'other' })
    const options = buildOptions([parent, source, other], source.id)
    expect(options.find((option) => option.id === parent.id)).toMatchObject({
      disabled: true, reason: 'habits.moveParent.invalidCurrentParent',
    })
    expect(options.find((option) => option.id === other.id)?.disabled).toBe(false)
  })

  it('disables selected targets and destinations invalid for part of the selection', () => {
    const source = createMockHabit({ id: 'source' })
    const child = createMockHabit({ id: 'child', parentId: source.id })
    const other = createMockHabit({ id: 'other' })
    const options = buildOptions([source, child, other], [source.id, other.id])
    for (const id of [source.id, other.id, child.id]) {
      expect(options.find((option) => option.id === id)).toMatchObject({
        disabled: true, reason: 'habits.moveParent.invalidForSome',
      })
    }
  })

  it('validates the resulting tree when moving a parent together with its descendant', () => {
    const source = createMockHabit({ id: 'source' })
    const child = createMockHabit({ id: 'child', parentId: source.id })
    const other = createMockHabit({ id: 'other' })
    const options = buildOptions([source, child, other], [source.id, child.id], 2)
    expect(options.find((option) => option.id === other.id)?.disabled).toBe(false)
  })
})

describe('move parent picker positioning and search', () => {
  it('keeps disabled reasons and the enabled row state on both adapters', () => {
    const options = buildOptions([createMockHabit({ id: 'source' }), createMockHabit({ id: 'target' })], 'source')
    const source = options.find((option) => option.id === 'source')
    const target = options.find((option) => option.id === 'target')
    if (!source || !target) throw new Error('Missing move options')
    expect(getMoveParentRowAvailability(source, 'Current')).toEqual({ disabled: true, reason: 'habits.moveParent.invalidSelf' })
    expect(getMoveParentRowAvailability({ ...source, reason: null }, 'Current')).toEqual({ disabled: true, reason: 'Current' })
    expect(getMoveParentRowAvailability(target, 'Current')).toEqual({ disabled: false })
  })

  it('places a deep current parent below one row of context without a negative offset', () => {
    expect(getMoveParentScrollOffset({ y: 480, height: 64 }, 48)).toBe(432)
    expect(getMoveParentScrollOffset({ y: 16, height: 64 }, 48)).toBe(0)
    expect(getMoveParentScrollOffset({ y: 480, height: 64 })).toBe(416)
    expect(getMoveParentScrollOffset(null)).toBe(0)
  })

  it('keeps root outside the filtered rows and searches only above eight destinations', () => {
    const habits = Array.from({ length: 9 }, (_, index) => createMockHabit({ id: String(index), title: `Habit ${index}` }))
    const options = buildOptions(habits, '0')
    const filtered = getMoveParentPickerRows(options, 'Habit 8')
    expect(filtered.showSearch).toBe(true)
    expect(filtered.rootOption?.id).toBeNull()
    expect(filtered.treeRows.map((row) => row.id)).toEqual(['8'])
    expect(filtered.isSearchEmpty).toBe(false)
    expect(getMoveParentPickerRows(options, 'absent').isSearchEmpty).toBe(true)
    const shortList = getMoveParentPickerRows(options.slice(0, 9), 'absent')
    expect(shortList.showSearch).toBe(false)
    expect(shortList.treeRows).toHaveLength(8)
  })
})

describe('move parent selection projection', () => {
  it('derives the single, bulk and closed picker from the same target rules', () => {
    const habits = [createMockHabit({ id: 'parent' }), createMockHabit({ id: 'source', parentId: 'parent' }), createMockHabit({ id: 'other' })]
    const tree = buildTree(habits)
    const t = (key: string) => key
    const deps = { ...tree, maxHabitDepth: 9, t,
      validateMoveTarget: (target: string | null, source: string) => validateMoveTarget({ ...tree, maxHabitDepth: 9, t }, target, source) }
    const single = getMoveParentSelection(deps, 'source', 'other')
    expect(single.moveIds).toEqual(['source'])
    expect(single.sharedMoveParentId).toBe('parent')
    expect(single.selectedMoveOption).toMatchObject({ id: 'other', disabled: false })
    const bulk = getMoveParentSelection(deps, ['source', 'other'], 'parent')
    expect(bulk.sharedMoveParentId).toBeUndefined()
    expect(bulk.selectedMoveOption?.disabled).toBe(true)
    const closed = getMoveParentSelection(deps, null, null)
    expect(closed.moveIds).toEqual([])
    expect(closed.moveParentOptions).toEqual([])
    expect(closed.selectedMoveOption).toBeNull()
  })
})
