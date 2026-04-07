import { describe, expect, it } from 'vitest'
import {
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
})
