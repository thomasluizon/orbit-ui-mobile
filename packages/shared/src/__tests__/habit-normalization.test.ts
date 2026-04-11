import { describe, expect, it } from 'vitest'
import type { HabitDetail, HabitScheduleItem } from '../types/habit'
import type { Goal } from '../types/goal'
import {
  applyLinkedGoalUpdates,
  habitDetailToNormalized,
  normalizeHabitQueryData,
  normalizeHabits,
  sortNormalizedHabits,
} from '../utils/habit-normalization'

function makeScheduleItem(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: overrides.id ?? 'h-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    scheduledDates: overrides.scheduledDates ?? ['2025-01-01'],
    isOverdue: overrides.isOverdue ?? false,
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    slipAlertEnabled: overrides.slipAlertEnabled ?? false,
    tags: overrides.tags ?? [],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    flexibleTarget: overrides.flexibleTarget ?? null,
    flexibleCompleted: overrides.flexibleCompleted ?? null,
    linkedGoals: overrides.linkedGoals,
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

describe('habit normalization utils', () => {
  it('sorts normalized habits by position then created time', () => {
    const normalized = normalizeHabits([
      makeScheduleItem({ id: 'h-1', position: 1, createdAtUtc: '2025-01-03T00:00:00Z' }),
      makeScheduleItem({ id: 'h-2', position: 0, createdAtUtc: '2025-01-02T00:00:00Z' }),
      makeScheduleItem({ id: 'h-3', position: 1, createdAtUtc: '2025-01-01T00:00:00Z' }),
    ])

    expect(Array.from(normalized.values()).sort(sortNormalizedHabits).map((habit) => habit.id)).toEqual([
      'h-2',
      'h-3',
      'h-1',
    ])
  })

  it('normalizes children into a flat map and child index', () => {
    const data = normalizeHabitQueryData([
      makeScheduleItem({
        id: 'parent',
        hasSubHabits: true,
        children: [
          {
            id: 'child-1',
            title: 'Child 1',
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
          },
        ],
      }),
    ])

    expect(data.habitsById.has('child-1')).toBe(true)
    expect(data.topLevelHabits.map((habit) => habit.id)).toEqual(['parent'])
    expect(data.childrenByParent.get('parent')).toEqual(['child-1'])
  })

  it('applies linked goal updates without disturbing unrelated goals', () => {
    const goals: Goal[] = [
      {
        id: 'goal-1',
        title: 'Read',
        description: null,
        targetValue: 10,
        currentValue: 2,
        unit: 'books',
        status: 'Active',
        deadline: null,
        position: 0,
        createdAtUtc: '2025-01-01T00:00:00Z',
        completedAtUtc: null,
        progressPercentage: 20,
      },
      {
        id: 'goal-2',
        title: 'Run',
        description: null,
        targetValue: 5,
        currentValue: 1,
        unit: 'km',
        status: 'Active',
        deadline: null,
        position: 1,
        createdAtUtc: '2025-01-01T00:00:00Z',
        completedAtUtc: null,
        progressPercentage: 20,
      },
    ]

    const updated = applyLinkedGoalUpdates(goals, [
      {
        goalId: 'goal-1',
        title: 'Read',
        newProgress: 6,
        targetValue: 10,
      },
    ])

    expect(updated[0]).toMatchObject({
      currentValue: 6,
      progressPercentage: 60,
    })
    expect(updated[1]).toMatchObject({
      currentValue: 1,
      progressPercentage: 20,
    })
  })
})

describe('habitDetailToNormalized', () => {
  function makeHabitDetail(overrides: Partial<HabitDetail> = {}): HabitDetail {
    return {
      id: overrides.id ?? 'h-1',
      title: overrides.title ?? 'Meditate',
      description: overrides.description ?? null,
      frequencyUnit: overrides.frequencyUnit ?? 'Day',
      frequencyQuantity: overrides.frequencyQuantity ?? 1,
      isBadHabit: overrides.isBadHabit ?? false,
      isCompleted: overrides.isCompleted ?? false,
      isGeneral: overrides.isGeneral ?? false,
      isFlexible: overrides.isFlexible ?? false,
      days: overrides.days ?? [],
      dueDate: overrides.dueDate ?? '2026-04-11',
      dueTime: overrides.dueTime ?? null,
      dueEndTime: overrides.dueEndTime ?? null,
      endDate: overrides.endDate ?? null,
      position: overrides.position ?? 0,
      checklistItems: overrides.checklistItems ?? [],
      createdAtUtc: overrides.createdAtUtc ?? '2026-04-11T00:00:00Z',
      reminderEnabled: overrides.reminderEnabled ?? false,
      reminderTimes: overrides.reminderTimes ?? [],
      scheduledReminders: overrides.scheduledReminders ?? [],
      children: overrides.children ?? [],
    }
  }

  it('preserves base habit fields from the detail', () => {
    const detail = makeHabitDetail({
      id: 'h-42',
      title: 'Read',
      description: 'Daily reading',
      checklistItems: [{ text: 'Chapter 1', isChecked: false }],
      dueTime: '20:00',
    })

    const result = habitDetailToNormalized(detail)

    expect(result.id).toBe('h-42')
    expect(result.title).toBe('Read')
    expect(result.description).toBe('Daily reading')
    expect(result.checklistItems).toEqual([{ text: 'Chapter 1', isChecked: false }])
    expect(result.dueTime).toBe('20:00')
  })

  it('fills schedule/list-only fields with safe defaults', () => {
    const result = habitDetailToNormalized(makeHabitDetail())

    expect(result.parentId).toBeNull()
    expect(result.scheduledDates).toEqual([])
    expect(result.isOverdue).toBe(false)
    expect(result.slipAlertEnabled).toBe(false)
    expect(result.tags).toEqual([])
    expect(result.flexibleTarget).toBeNull()
    expect(result.flexibleCompleted).toBeNull()
    expect(result.isLoggedInRange).toBe(false)
    expect(result.instances).toEqual([])
  })

  it('derives hasSubHabits from children length', () => {
    const withoutChildren = habitDetailToNormalized(makeHabitDetail({ children: [] }))
    expect(withoutChildren.hasSubHabits).toBe(false)

    const withChildren = habitDetailToNormalized(
      makeHabitDetail({
        children: [
          {
            id: 'c-1',
            title: 'Child',
            description: null,
            frequencyUnit: 'Day',
            frequencyQuantity: 1,
            isBadHabit: false,
            isCompleted: false,
            isGeneral: false,
            isFlexible: false,
            days: [],
            dueDate: '2026-04-11',
            dueTime: null,
            dueEndTime: null,
            endDate: null,
            position: 0,
            checklistItems: [],
            children: [],
          },
        ],
      }),
    )
    expect(withChildren.hasSubHabits).toBe(true)
  })

  it('does not include the children property on the result', () => {
    const result = habitDetailToNormalized(makeHabitDetail())
    expect('children' in result).toBe(false)
  })
})
