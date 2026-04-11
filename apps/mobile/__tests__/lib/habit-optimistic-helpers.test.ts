import { describe, expect, it } from 'vitest'
import {
  optimisticInsertHabit,
  optimisticInsertSubHabit,
  optimisticPatchHabit,
  optimisticRemoveHabits,
  optimisticReorderHabits,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import type { ChecklistItem, HabitScheduleChild, HabitScheduleItem } from '@orbit/shared/types/habit'

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'habit-1',
    title: 'Test Habit',
    description: '',
    frequencyUnit: null,
    frequencyQuantity: null,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-01-15',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    parentId: null,
    scheduledDates: [],
    isOverdue: false,
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: false,
    flexibleTarget: null,
    flexibleCompleted: 0,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
    children: [],
    searchMatches: null,
    ...overrides,
  } as unknown as HabitScheduleItem
}

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    ...makeHabit(overrides as Partial<HabitScheduleItem>),
    isLoggedInRange: false,
    instances: [],
    children: [],
    hasSubHabits: false,
    ...overrides,
  } as unknown as HabitScheduleChild
}

describe('mobile optimistic habit helpers', () => {
  it('toggles top-level completion and resets recurring checklist items', () => {
    const result = optimisticToggleCompletion(
      [
        makeHabit({
          frequencyUnit: 'Day',
          checklistItems: [
            { text: 'A', isChecked: true },
            { text: 'B', isChecked: true },
          ],
        }),
      ],
      'habit-1',
    )

    expect(result[0]?.isCompleted).toBe(true)
    expect(result[0]?.checklistItems.map((item) => item.isChecked)).toEqual([false, false])
  })

  it('toggles child completion', () => {
    const child = makeHabit({ id: 'child-1' })
    const parent = makeHabit({
      id: 'parent-1',
      children: [child] as unknown as HabitScheduleChild[],
    })

    const result = optimisticToggleCompletion([parent], 'child-1')

    expect(result[0]?.children[0]?.isCompleted).toBe(true)
  })

  it('updates checklist items for parent and child habits', () => {
    const newItems: ChecklistItem[] = [{ text: 'Done', isChecked: true }]
    const child = makeHabit({ id: 'child-1' })
    const parent = makeHabit({
      id: 'parent-1',
      children: [child] as unknown as HabitScheduleChild[],
    })

    const topLevelResult = optimisticUpdateChecklist([makeHabit()], 'habit-1', newItems)
    const childResult = optimisticUpdateChecklist([parent], 'child-1', newItems)

    expect(topLevelResult[0]?.checklistItems).toEqual(newItems)
    expect(childResult[0]?.children[0]?.checklistItems).toEqual(newItems)
  })

  it('patches nested child habits without mutating unrelated nodes', () => {
    const nestedChild = makeChild({ id: 'nested-child' })
    const child = makeChild({ id: 'child-1', children: [nestedChild], hasSubHabits: true })
    const parent = makeHabit({
      id: 'parent-1',
      children: [child] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })

    const result = optimisticPatchHabit([parent], 'nested-child', {
      title: 'Updated nested child',
    })

    expect(result[0]?.children[0]?.children[0]?.title).toBe('Updated nested child')
    expect(result[0]?.children[0]?.title).toBe('Test Habit')
  })

  it('removes top-level and nested child habits while preserving subtree flags', () => {
    const nestedChild = makeChild({ id: 'nested-child' })
    const child = makeChild({ id: 'child-1', children: [nestedChild], hasSubHabits: true })
    const keepParent = makeHabit({
      id: 'keep-parent',
      children: [child] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })
    const removeParent = makeHabit({ id: 'remove-parent' })

    const result = optimisticRemoveHabits(
      [keepParent, removeParent],
      ['remove-parent', 'nested-child'],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('keep-parent')
    expect(result[0]?.children[0]?.children).toEqual([])
    expect(result[0]?.children[0]?.hasSubHabits).toBe(false)
  })

  it('inserts top-level and child habits into the correct parent', () => {
    const newHabit = makeHabit({ id: 'habit-2' })
    const nestedParent = makeChild({ id: 'child-parent' })
    const parent = makeHabit({
      id: 'parent-1',
      children: [nestedParent] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })
    const newChild = makeChild({ id: 'child-2' })

    const insertedTopLevel = optimisticInsertHabit([parent], newHabit)
    const insertedChild = optimisticInsertSubHabit([parent], 'child-parent', newChild)

    expect(insertedTopLevel.map((habit) => habit.id)).toEqual(['parent-1', 'habit-2'])
    expect(insertedChild[0]?.children[0]?.children[0]?.id).toBe('child-2')
    expect(insertedChild[0]?.children[0]?.hasSubHabits).toBe(true)
  })

  it('reorders parent and nested child positions from a position map', () => {
    const child = makeChild({ id: 'child-1', position: 0 })
    const parent = makeHabit({
      id: 'parent-1',
      position: 0,
      children: [child] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })

    const result = optimisticReorderHabits([parent], [
      { habitId: 'parent-1', position: 2 },
      { habitId: 'child-1', position: 4 },
    ])

    expect(result[0]?.position).toBe(2)
    expect(result[0]?.children[0]?.position).toBe(4)
  })
})
