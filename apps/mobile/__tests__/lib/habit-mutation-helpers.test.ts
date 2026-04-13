import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  gamificationKeys,
  goalKeys,
  habitKeys,
  profileKeys,
  tagKeys,
} from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import {
  buildOptimisticDuplicateHabit,
  buildOptimisticHabit,
  buildOptimisticHabitPatch,
  buildOptimisticSubHabit,
  finalizeHabitMutation,
  optimisticMoveHabitParent,
} from '@/lib/habit-mutation-helpers'
import type { Goal } from '@orbit/shared/types/goal'
import type {
  HabitScheduleChild,
  HabitScheduleItem,
  UpdateHabitRequest,
} from '@orbit/shared/types/habit'

const mocks = vi.hoisted(() => ({
  isQueuedResult: vi.fn((value: unknown) => (
    typeof value === 'object' &&
    value !== null &&
    'queued' in value &&
    (value as { queued?: boolean }).queued === true
  )),
  refreshWidget: vi.fn(async () => {}),
}))

vi.mock('@/lib/offline-mutations', () => ({
  isQueuedResult: mocks.isQueuedResult,
}))

vi.mock('@/lib/orbit-widget', () => ({
  refreshWidget: mocks.refreshWidget,
}))

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: 'habit-1',
    title: 'Test Habit',
    description: 'Description',
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    isBadHabit: false,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: '2025-02-10',
    dueTime: '08:00',
    dueEndTime: null,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2025-01-01T00:00:00Z',
    scheduledDates: ['2025-02-10'],
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
    searchMatches: null,
    ...overrides,
  } as HabitScheduleItem
}

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    ...makeHabit(overrides as Partial<HabitScheduleItem>),
    isLoggedInRange: false,
    instances: [],
    children: [],
    hasSubHabits: false,
    ...overrides,
  } as HabitScheduleChild
}

describe('finalizeHabitMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-10T12:00:00Z'))
    mocks.refreshWidget.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips invalidation for queued mutations', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    }

    await finalizeHabitMutation(
      queryClient as never,
      { queued: true, queuedMutationId: 'offline-mutation-1' },
      null,
      {
        habitId: 'habit-1',
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      },
    )

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(mocks.refreshWidget).not.toHaveBeenCalled()
  })

  it('invalidates habit-related caches and refreshes the widget on success', async () => {
    const queryClient = {
      invalidateQueries: vi.fn(async () => {}),
    }

    await finalizeHabitMutation(
      queryClient as never,
      { ok: true },
      null,
      {
        habitId: 'habit-1',
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      },
    )

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.detail('habit-1'),
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: goalKeys.lists() })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: gamificationKeys.all })
    expect(mocks.refreshWidget).toHaveBeenCalledTimes(1)
  })

  it('returns immediately instead of waiting for invalidations to settle', () => {
    const pendingInvalidation = new Promise<void>(() => {})
    const queryClient = {
      invalidateQueries: vi.fn(() => pendingInvalidation),
    }

    const result = finalizeHabitMutation(
      queryClient as never,
      { ok: true },
      null,
      {
        habitId: 'habit-1',
        includeGoals: true,
        includeProfile: true,
        includeGamification: true,
      },
    )

    expect(result).toBeUndefined()
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: habitKeys.lists() })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: habitKeys.summaryPrefix(),
    })
    expect(mocks.refreshWidget).toHaveBeenCalledTimes(1)
  })
})

describe('habit mutation helper builders', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds optimistic habits using cached tags, goals, next position, and default due dates', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(habitKeys.lists(), [
      makeHabit({ id: 'existing-1', position: 0 }),
      makeHabit({ id: 'existing-2', position: 3 }),
    ])
    queryClient.setQueryData(goalKeys.lists(), [
      { id: 'goal-1', title: 'Read 12 books' } as Goal,
    ])
    queryClient.setQueryData(tagKeys.lists(), [
      { id: 'tag-1', name: 'Learning', color: '#3b82f6' },
    ])

    const result = buildOptimisticHabit(queryClient, 'temp-habit', {
      title: 'Read 20 minutes',
      tagIds: ['tag-1'],
      goalIds: ['goal-1'],
      reminderEnabled: true,
      reminderTimes: [10],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
      slipAlertEnabled: true,
    })

    expect(result.position).toBe(4)
    expect(result.dueDate).toBe(formatAPIDate(new Date()))
    expect(result.tags).toEqual([
      { id: 'tag-1', name: 'Learning', color: '#3b82f6' },
    ])
    expect(result.linkedGoals).toEqual([{ id: 'goal-1', title: 'Read 12 books' }])
    expect(result.instances).toEqual([
      { date: formatAPIDate(new Date()), status: 'Pending', logId: null, note: null },
    ])
  })

  it('builds optimistic sub-habits using the parent due date and cached tags', () => {
    const queryClient = createQueryClient()
    const parent = makeHabit({
      id: 'parent-1',
      dueDate: '2025-03-01',
      children: [makeChild({ id: 'existing-child' })],
      hasSubHabits: true,
    })
    queryClient.setQueryData(habitKeys.lists(), [parent])
    queryClient.setQueryData(tagKeys.lists(), [
      { id: 'tag-1', name: 'Health', color: '#22c55e' },
    ])

    const result = buildOptimisticSubHabit(queryClient, 'parent-1', 'temp-child', {
      title: 'Stretch',
      tagIds: ['tag-1'],
    })

    expect(result.position).toBe(1)
    expect(result.dueDate).toBe('2025-03-01')
    expect(result.tags).toEqual([
      { id: 'tag-1', name: 'Health', color: '#22c55e' },
    ])
    expect(result.instances).toEqual([
      { date: '2025-03-01', status: 'Pending', logId: null, note: null },
    ])
  })

  it('duplicates an existing habit and returns null when the source habit is missing', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(habitKeys.lists(), [
      makeHabit({
        id: 'habit-1',
        title: 'Morning Run',
        tags: [{ id: 'tag-1', name: 'Fitness', color: '#ef4444' }],
        reminderEnabled: true,
        reminderTimes: [15],
        scheduledReminders: [{ when: 'day_before', time: '18:00' }],
        slipAlertEnabled: true,
      }),
    ])
    queryClient.setQueryData(tagKeys.lists(), [
      { id: 'tag-1', name: 'Fitness', color: '#ef4444' },
    ])

    const duplicate = buildOptimisticDuplicateHabit(queryClient, 'habit-1', 'temp-copy')

    expect(duplicate).toMatchObject({
      id: 'temp-copy',
      title: 'Morning Run Copy',
      tags: [{ id: 'tag-1', name: 'Fitness', color: '#ef4444' }],
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'day_before', time: '18:00' }],
      slipAlertEnabled: true,
    })
    expect(buildOptimisticDuplicateHabit(queryClient, 'missing-habit', 'temp-missing')).toBeNull()
  })

  it('builds optimistic patches including linked goals and clears schedule fields for general habits', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(goalKeys.lists(), [
      { id: 'goal-1', title: 'Run 5k' } as Goal,
    ])

    const patch = buildOptimisticHabitPatch(queryClient, {
      title: 'Updated Habit',
      description: 'Updated description',
      isBadHabit: true,
      isGeneral: true,
      isFlexible: true,
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      days: ['Monday', 'Wednesday'],
      dueDate: '2025-03-01',
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
      reminderTimes: [5],
      scheduledReminders: [{ when: 'same_day', time: '09:00' }],
      slipAlertEnabled: true,
      checklistItems: [{ text: 'Step 1', isChecked: false }],
      goalIds: ['goal-1'],
      endDate: '2025-04-01',
      clearEndDate: true,
    } satisfies UpdateHabitRequest)

    expect(patch).toMatchObject({
      title: 'Updated Habit',
      description: 'Updated description',
      isBadHabit: true,
      isGeneral: true,
      isFlexible: true,
      linkedGoals: [{ id: 'goal-1', title: 'Run 5k' }],
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      dueTime: null,
      dueEndTime: null,
      endDate: null,
    })
  })
})

describe('optimisticMoveHabitParent', () => {
  it('moves a child habit to the top level and reindexes the list', () => {
    const movingChild = makeChild({ id: 'child-1' })
    const parent = makeHabit({
      id: 'parent-1',
      children: [movingChild],
      hasSubHabits: true,
    })
    const sibling = makeHabit({ id: 'parent-2', position: 1 })

    const result = optimisticMoveHabitParent([parent, sibling], 'child-1', null)

    expect(result.map((habit) => habit.id)).toEqual(['parent-1', 'parent-2', 'child-1'])
    expect(result[0]?.hasSubHabits).toBe(false)
    expect(result[2]).toMatchObject({
      id: 'child-1',
      position: 2,
      createdAtUtc: '2025-01-01T00:00:00Z',
    })
  })

  it('moves a top-level habit under a nested child parent', () => {
    const nestedParent = makeChild({ id: 'child-parent' })
    const topLevelParent = makeHabit({
      id: 'parent-1',
      children: [nestedParent],
      hasSubHabits: true,
    })
    const movingHabit = makeHabit({ id: 'move-me', position: 1 })

    const result = optimisticMoveHabitParent(
      [topLevelParent, movingHabit],
      'move-me',
      'child-parent',
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.children[0]?.children[0]?.id).toBe('move-me')
    expect(result[0]?.children[0]?.hasSubHabits).toBe(true)
  })

  it('prevents moving a habit under its own descendant', () => {
    const child = makeChild({ id: 'child-1' })
    const parent = makeHabit({
      id: 'parent-1',
      children: [child],
      hasSubHabits: true,
    })

    const result = optimisticMoveHabitParent([parent], 'parent-1', 'child-1')

    expect(result).toEqual([parent])
  })
})
