import { describe, it, expect } from 'vitest'
import {
  optimisticPatchHabit,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import type { HabitScheduleItem, HabitScheduleChild, ChecklistItem } from '@orbit/shared/types/habit'

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'h1',
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

describe('optimisticToggleCompletion', () => {
  it('toggles a top-level habit from incomplete to complete', () => {
    const items = [makeHabit({ id: 'h1', isCompleted: false })]
    const result = optimisticToggleCompletion(items, 'h1')
    expect(result[0]!.isCompleted).toBe(true)
  })

  it('toggles a top-level habit from complete to incomplete', () => {
    const items = [makeHabit({ id: 'h1', isCompleted: true })]
    const result = optimisticToggleCompletion(items, 'h1')
    expect(result[0]!.isCompleted).toBe(false)
  })

  it('resets checklist items when completing a recurring habit', () => {
    const items = [
      makeHabit({
        id: 'h1',
        isCompleted: false,
        frequencyUnit: 'Day' as const,
        checklistItems: [
          { text: 'Step 1', isChecked: true },
          { text: 'Step 2', isChecked: true },
        ],
      }),
    ]
    const result = optimisticToggleCompletion(items, 'h1')
    expect(result[0]!.isCompleted).toBe(true)
    expect(result[0]!.checklistItems[0]!.isChecked).toBe(false)
    expect(result[0]!.checklistItems[1]!.isChecked).toBe(false)
  })

  it('toggles a child habit', () => {
    const child = makeHabit({ id: 'child1', isCompleted: false })
    const parent = makeHabit({
      id: 'parent1',
      children: [child] as unknown as HabitScheduleChild[],
    })
    const result = optimisticToggleCompletion([parent], 'child1') as HabitScheduleItem[]
    expect(result[0]!.children[0]!.isCompleted).toBe(true)
  })

  it('does not modify unrelated items', () => {
    const items = [
      makeHabit({ id: 'h1', isCompleted: false }),
      makeHabit({ id: 'h2', isCompleted: true }),
    ]
    const result = optimisticToggleCompletion(items, 'h1')
    expect(result[1]!.isCompleted).toBe(true)
  })
})

describe('optimisticUpdateChecklist', () => {
  it('updates checklist items on a top-level habit', () => {
    const items = [makeHabit({ id: 'h1', checklistItems: [] })]
    const newItems: ChecklistItem[] = [
      { text: 'New item', isChecked: true },
    ]
    const result = optimisticUpdateChecklist(items, 'h1', newItems)
    expect(result[0]!.checklistItems).toEqual(newItems)
  })

  it('updates checklist items on a child habit', () => {
    const child = makeHabit({ id: 'child1', checklistItems: [] })
    const parent = makeHabit({
      id: 'parent1',
      children: [child] as unknown as HabitScheduleChild[],
    })
    const newItems: ChecklistItem[] = [{ text: 'Done', isChecked: true }]
    const result = optimisticUpdateChecklist([parent], 'child1', newItems) as HabitScheduleItem[]
    expect(result[0]!.children[0]!.checklistItems).toEqual(newItems)
  })

  it('does not modify unrelated items', () => {
    const items = [
      makeHabit({ id: 'h1', checklistItems: [{ text: 'A', isChecked: false }] }),
      makeHabit({ id: 'h2', checklistItems: [{ text: 'B', isChecked: false }] }),
    ]
    const result = optimisticUpdateChecklist(items, 'h1', [{ text: 'Updated', isChecked: true }])
    expect(result[1]!.checklistItems[0]!.text).toBe('B')
  })
})

describe('optimisticPatchHabit', () => {
  it('patches nested child habits recursively', () => {
    const grandchild = makeHabit({ id: 'grandchild-1', title: 'Old title' })
    const child = makeHabit({
      id: 'child-1',
      children: [grandchild] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })
    const parent = makeHabit({
      id: 'parent-1',
      children: [child] as unknown as HabitScheduleChild[],
      hasSubHabits: true,
    })

    const result = optimisticPatchHabit([parent], 'grandchild-1', {
      title: 'New title',
      isOverdue: true,
    })

    expect(result[0]?.children[0]?.children[0]).toMatchObject({
      id: 'grandchild-1',
      title: 'New title',
      isOverdue: true,
    })
  })
})
