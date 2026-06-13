import { describe, expect, it } from 'vitest'
import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'
import { optimisticPatchHabit, withChildren } from '../utils/habit-optimistic'

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    id: 'child-1',
    title: 'Child habit',
    description: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    tags: [],
    children: [],
    hasSubHabits: false,
    isLoggedInRange: false,
    instances: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'habit-1',
    title: 'Parent habit',
    description: null,
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    children: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: null,
    instances: [],
    ...overrides,
  }
}

describe('withChildren', () => {
  it('sets hasSubHabits true when children remain', () => {
    const node = makeChild({ hasSubHabits: false })
    const result = withChildren(node, [makeChild({ id: 'child-2' })])

    expect(result.children.map((child) => child.id)).toEqual(['child-2'])
    expect(result.hasSubHabits).toBe(true)
  })

  it('keeps hasSubHabits when the node reported unloaded sub-habits', () => {
    const node = makeChild({ hasSubHabits: true, children: [] })

    expect(withChildren(node, []).hasSubHabits).toBe(true)
  })

  it('clears hasSubHabits when loaded children are removed', () => {
    const node = makeChild({
      hasSubHabits: true,
      children: [makeChild({ id: 'child-2' })],
    })

    expect(withChildren(node, []).hasSubHabits).toBe(false)
  })
})

describe('optimisticPatchHabit', () => {
  it('patches a top-level habit and leaves the rest untouched', () => {
    const items = [makeItem({ id: 'habit-1' }), makeItem({ id: 'habit-2' })]

    const result = optimisticPatchHabit(items, 'habit-1', { isCompleted: true })

    expect(result[0]?.isCompleted).toBe(true)
    expect(result[1]).toEqual(items[1])
  })

  it('patches a direct child', () => {
    const items = [
      makeItem({
        id: 'habit-1',
        children: [makeChild({ id: 'child-1' }), makeChild({ id: 'child-2' })],
        hasSubHabits: true,
      }),
    ]

    const result = optimisticPatchHabit(items, 'child-2', { title: 'Renamed' })

    expect(result[0]?.children[1]?.title).toBe('Renamed')
    expect(result[0]?.children[0]?.title).toBe('Child habit')
  })

  it('patches a nested grandchild through recursion', () => {
    const items = [
      makeItem({
        id: 'habit-1',
        children: [
          makeChild({
            id: 'child-1',
            children: [makeChild({ id: 'grandchild-1' })],
            hasSubHabits: true,
          }),
        ],
        hasSubHabits: true,
      }),
    ]

    const result = optimisticPatchHabit(items, 'grandchild-1', { isCompleted: true })

    expect(result[0]?.children[0]?.children[0]?.isCompleted).toBe(true)
  })

  it('returns equivalent items when the id matches nothing', () => {
    const items = [makeItem({ id: 'habit-1' })]

    const result = optimisticPatchHabit(items, 'missing', { isCompleted: true })

    expect(result[0]?.isCompleted).toBe(false)
  })
})
