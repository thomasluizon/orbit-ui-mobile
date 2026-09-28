import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'
import {
  buildOptimisticSkipPatch,
  findHabitInList,
  findHabitInTree,
  getTomorrowDateString,
} from '../utils/habit-optimistic'
import { hasHabitScheduleOnDate } from '../utils/habits'

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

  it('removes recurring habits from today without marking them completed', () => {
    const patch = buildOptimisticSkipPatch(makeItem({
      frequencyUnit: 'Day',
      dueDate: '2026-04-06',
      scheduledDates: ['2026-04-06', '2026-04-08'],
      instances: [
        { date: '2026-04-06', status: 'Pending', logId: null },
        { date: '2026-04-08', status: 'Pending', logId: null },
      ],
    }))
    expect(patch).toEqual({
      dueDate: '2026-04-08',
      scheduledDates: ['2026-04-08'],
      instances: [{ date: '2026-04-08', status: 'Pending', logId: null }],
      isOverdue: false,
    })
  })

  it('postpones one-time habits to tomorrow', () => {
    const patch = buildOptimisticSkipPatch(makeItem({ frequencyUnit: null }))

    expect(patch).toEqual({
      dueDate: '2026-04-07',
      scheduledDates: ['2026-04-07'],
      isOverdue: false,
      instances: [{ date: '2026-04-07', status: 'Pending', logId: null }],
    })
  })

  it('moves the occurrence beyond an account day ahead of the device day', () => {
    const recurringHabit = makeItem({
      frequencyUnit: 'Day', dueDate: '2026-04-07',
      scheduledDates: ['2026-04-07'],
    })
    const oneTimeHabit = makeItem({
      frequencyUnit: null, dueDate: '2026-04-07', scheduledDates: ['2026-04-07'],
    })
    const recurring = buildOptimisticSkipPatch(recurringHabit, '2026-04-07')
    const oneTime = buildOptimisticSkipPatch(oneTimeHabit, '2026-04-07')

    expect(recurring.dueDate).toBe('2026-04-08')
    expect(recurring.scheduledDates).toEqual([])
    expect(oneTime.dueDate).toBe('2026-04-08')
    expect(oneTime.isCompleted).toBeUndefined()
    expect(hasHabitScheduleOnDate({ ...recurringHabit, ...recurring }, '2026-04-07')).toBe(false)
    expect(hasHabitScheduleOnDate({ ...oneTimeHabit, ...oneTime }, '2026-04-07')).toBe(false)
  })
})
