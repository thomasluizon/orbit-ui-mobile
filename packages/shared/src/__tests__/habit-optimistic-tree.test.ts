import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'
import {
  buildOptimisticSkipPatch,
  findHabitInList,
  findHabitInTree,
  getTomorrowDateString,
} from '../utils/habit-optimistic'

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    id: 'child-1',
    title: 'Child',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-01-01',
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
    title: 'Parent',
    description: null,
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2026-01-01',
    dueTime: null,
    dueEndTime: null,
    endDate: null,
    position: null,
    checklistItems: [],
    createdAtUtc: '2026-01-01T00:00:00Z',
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
    linkedGoals: [],
    instances: [],
    ...overrides,
  }
}

describe('getTomorrowDateString', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the next calendar day formatted for the API', () => {
    expect(getTomorrowDateString()).toBe('2026-04-07')
  })
})

describe('findHabitInTree / findHabitInList', () => {
  it('finds the node itself, a nested descendant, and returns null when absent', () => {
    const grandchild = makeChild({ id: 'grandchild' })
    const child = makeChild({ id: 'child', children: [grandchild] })
    const item = makeItem({ id: 'habit-1', children: [child] })

    expect(findHabitInTree(item, 'habit-1')).toBe(item)
    expect(findHabitInTree(item, 'grandchild')).toBe(grandchild)
    expect(findHabitInTree(item, 'missing')).toBeNull()

    expect(findHabitInList([item], 'child')).toBe(child)
    expect(findHabitInList([item], 'nope')).toBeNull()
  })
})

describe('buildOptimisticSkipPatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks recurring habits completed', () => {
    expect(buildOptimisticSkipPatch(makeItem({ frequencyUnit: 'Day' }))).toEqual({ isCompleted: true })
  })

  it('postpones one-time habits to tomorrow', () => {
    const patch = buildOptimisticSkipPatch(makeItem({ frequencyUnit: null }))

    expect(patch).toEqual({
      isCompleted: false,
      dueDate: '2026-04-07',
      scheduledDates: ['2026-04-07'],
      isOverdue: false,
      instances: [{ date: '2026-04-07', status: 'Pending', logId: null }],
    })
  })
})
