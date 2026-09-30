import { describe, expect, it } from 'vitest'
import {
  buildCalendarDayMap,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  determineHabitDayStatus,
  hasAncestorInSet,
} from '../utils/habits'
import type { CalendarMonthResponse } from '../types/habit'
import { createMockHabit } from './factories'

describe('determineHabitDayStatus', () => {
  it('returns completed when the habit was logged', () => {
    expect(
      determineHabitDayStatus(new Date('2026-04-05T00:00:00'), true, new Date('2026-04-05T12:00:00')),
    ).toBe('completed')
  })

  it('returns upcoming for today or future dates', () => {
    expect(
      determineHabitDayStatus(new Date('2026-04-05T00:00:00'), false, new Date('2026-04-05T12:00:00')),
    ).toBe('upcoming')
    expect(
      determineHabitDayStatus(new Date('2026-04-06T00:00:00'), false, new Date('2026-04-05T12:00:00')),
    ).toBe('upcoming')
  })

  it('returns missed for past dates without a log', () => {
    expect(
      determineHabitDayStatus(new Date('2026-04-04T00:00:00'), false, new Date('2026-04-05T12:00:00')),
    ).toBe('missed')
  })
})

describe('buildCalendarDayMap', () => {
  it.each([
    { isFlexible: true, isGrandchild: false },
    { isFlexible: false, isGrandchild: false },
    { isFlexible: true, isGrandchild: true },
    { isFlexible: false, isGrandchild: true },
  ])('shows the exact logged day for an instance-free descendant: %j', ({ isFlexible, isGrandchild }) => {
    const descendant = {
      ...createMockHabit({
        id: 'descendant',
        isFlexible,
        isCompleted: !isFlexible,
        frequencyUnit: isFlexible ? 'Week' : null,
        frequencyQuantity: isFlexible ? 1 : null,
        dueDate: '2026-04-04',
        scheduledDates: isFlexible ? ['2026-04-04', '2026-04-05', '2026-04-06'] : ['2026-04-05'],
        isLoggedInRange: true,
      }),
      children: [],
    }
    const children = isGrandchild
      ? [{ ...createMockHabit({ id: 'child' }), children: [descendant] }]
      : [descendant]
    const parent = {
      ...createMockHabit({ scheduledDates: [], dueTime: '08:00', hasSubHabits: true }),
      children,
      linkedGoals: [],
    }
    const dayMap = buildCalendarDayMap({
      habits: [parent],
      logs: {
        descendant: [
          { id: 'positive', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' },
          { id: 'skip', date: '2026-04-06', value: 0, createdAtUtc: '2026-04-06T08:00:00Z' },
        ],
      },
    }, new Date('2026-04-07T12:00:00'))

    expect([...dayMap.keys()]).toEqual(['2026-04-05'])
    expect(dayMap.get('2026-04-05')).toEqual([{
      habitId: parent.id,
      title: parent.title,
      status: 'completed',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }])
  })

  it('keeps one family entry across duplicate logs, siblings and instance logs', () => {
    const child = {
      ...createMockHabit({ id: 'child', instances: [
        { date: '2026-04-05', status: 'Completed', logId: 'positive' },
      ] }),
      children: [],
    }
    const sibling = { ...createMockHabit({ id: 'sibling', isFlexible: true }), children: [] }
    const dayMap = buildCalendarDayMap({
      habits: [{ ...createMockHabit({ scheduledDates: [], hasSubHabits: true }), children: [child, sibling], linkedGoals: [] }],
      logs: {
        child: [
          { id: 'positive', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' },
          { id: 'duplicate', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T09:00:00Z' },
        ],
        sibling: [{ id: 'sibling-log', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' }],
      },
    })

    expect(dayMap.get('2026-04-05')).toEqual([expect.objectContaining({ habitId: 'habit-1', status: 'completed' })])
  })

  it('preserves instance log dates when descendant dictionary entries are absent', () => {
    const dayMap = buildCalendarDayMap({
      habits: [{
        ...createMockHabit({ scheduledDates: [] }),
        children: [{ ...createMockHabit({ id: 'child', instances: [
          { date: '2026-04-05', status: 'Completed', logId: 'positive' },
          { date: '2026-04-06', status: 'Pending', logId: null },
        ] }), children: [] }],
        linkedGoals: [],
      }],
      logs: {},
    })

    expect([...dayMap.keys()]).toEqual(['2026-04-05'])
    expect(dayMap.get('2026-04-05')).toEqual([expect.objectContaining({ habitId: 'habit-1', status: 'completed' })])
  })

  it('adds no family entry for an unlogged or skipped descendant', () => {
    const dayMap = buildCalendarDayMap({
      habits: [{
        ...createMockHabit({ scheduledDates: [] }),
        children: [{ ...createMockHabit({ id: 'child', instances: [
          { date: '2026-04-05', status: 'Completed', logId: 'skip' },
        ] }), children: [] }],
        linkedGoals: [],
      }],
      logs: { child: [{ id: 'skip', date: '2026-04-05', value: 0, createdAtUtc: '2026-04-05T08:00:00Z' }] },
    })

    expect(dayMap).toEqual(new Map())
  })

  it('builds top-level entries without counting a skip or logged sub-habit as a completion', () => {
    const calendarMonth: CalendarMonthResponse = {
      habits: [
        {
          id: 'habit-1',
          title: 'Morning walk',
          description: null,
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          isBadHabit: false,
          isCompleted: false,
          isGeneral: false,
          isFlexible: false,
          days: [],
          dueDate: '2026-04-05',
          dueTime: '08:00',
          dueEndTime: null,
          endDate: null,
          position: 0,
          checklistItems: [],
          createdAtUtc: '2026-04-01T00:00:00Z',
          scheduledDates: ['2026-04-04', '2026-04-05', '2026-04-06'],
          isOverdue: false,
          reminderEnabled: false,
          reminderTimes: [],
          scheduledReminders: [],
          slipAlertEnabled: false,
          tags: [],
          children: [
            {
              id: 'child-1',
              title: 'Walk uphill',
              description: null,
              frequencyUnit: 'Day',
              frequencyQuantity: 1,
              isBadHabit: false,
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2026-04-06',
              dueTime: null,
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              scheduledDates: ['2026-04-06'],
              isOverdue: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              flexibleTarget: null,
              flexibleCompleted: null,
              isLoggedInRange: true,
              instances: [],
              searchMatches: null,
            },
          ],
          hasSubHabits: true,
          flexibleTarget: null,
          flexibleCompleted: null,
          linkedGoals: [],
          instances: [],
          searchMatches: null,
        },
        {
          id: 'habit-2',
          title: 'Passport renewal',
          description: null,
          frequencyUnit: null,
          frequencyQuantity: null,
          isBadHabit: false,
          isCompleted: false,
          isGeneral: false,
          isFlexible: false,
          days: [],
          dueDate: '2026-04-04',
          dueTime: null,
          dueEndTime: null,
          endDate: null,
          position: 1,
          checklistItems: [],
          createdAtUtc: '2026-04-01T00:00:00Z',
          scheduledDates: ['2026-04-04'],
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
        },
      ],
      logs: {
        'habit-1': [
          { id: 'skip-1', date: '2026-04-04', value: 0, createdAtUtc: '2026-04-04T08:00:00Z' },
          { id: 'log-1', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' },
        ],
        'child-1': [{ id: 'child-log', date: '2026-04-06', value: 1, createdAtUtc: '2026-04-06T08:00:00Z' }],
      },
    }

    const dayMap = buildCalendarDayMap(calendarMonth, new Date('2026-04-05T12:00:00'))

    expect(dayMap.get('2026-04-05')).toEqual([
      {
        habitId: 'habit-1',
        title: 'Morning walk',
        status: 'completed',
        isBadHabit: false,
        dueTime: '08:00',
        isOneTime: false,
      },
    ])
    expect(dayMap.get('2026-04-06')).toEqual([
      {
        habitId: 'habit-1',
        title: 'Morning walk',
        status: 'upcoming',
        isBadHabit: false,
        dueTime: '08:00',
        isOneTime: false,
      },
    ])
    expect(dayMap.get('2026-04-04')).toEqual([
      {
        habitId: 'habit-1',
        title: 'Morning walk',
        status: 'missed',
        isBadHabit: false,
        dueTime: '08:00',
        isOneTime: false,
      },
      {
        habitId: 'habit-2',
        title: 'Passport renewal',
        status: 'missed',
        isBadHabit: false,
        dueTime: null,
        isOneTime: true,
      },
    ])
  })

  it('excludes general habits even when the response carries scheduled dates', () => {
    const calendarMonth: CalendarMonthResponse = {
      habits: [
        {
          id: 'general-habit',
          title: 'Read whenever',
          description: null,
          frequencyUnit: null,
          frequencyQuantity: null,
          isBadHabit: false,
          isCompleted: false,
          isGeneral: true,
          isFlexible: false,
          days: [],
          dueDate: '2026-04-05',
          dueTime: null,
          dueEndTime: null,
          endDate: null,
          position: 0,
          checklistItems: [],
          createdAtUtc: '2026-04-01T00:00:00Z',
          scheduledDates: ['2026-04-05'],
          isOverdue: false,
          reminderEnabled: false,
          reminderTimes: [],
          scheduledReminders: [],
          slipAlertEnabled: false,
          tags: [],
          children: [
            {
              id: 'child-1',
              title: 'Walk uphill',
              description: null,
              frequencyUnit: 'Day',
              frequencyQuantity: 1,
              isBadHabit: false,
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2026-04-06',
              dueTime: null,
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              scheduledDates: ['2026-04-06'],
              isOverdue: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              flexibleTarget: null,
              flexibleCompleted: null,
              isLoggedInRange: true,
              instances: [],
              searchMatches: null,
            },
          ],
          hasSubHabits: true,
          flexibleTarget: null,
          flexibleCompleted: null,
          linkedGoals: [],
          instances: [],
          searchMatches: null,
        },
      ],
      logs: {
        'general-habit': [
          { id: 'general-log', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' },
        ],
      },
    }

    expect(buildCalendarDayMap(calendarMonth, new Date('2026-04-05T12:00:00'))).toEqual(new Map())
  })
})

describe('collectSelectableDescendantIds', () => {
  it('skips descendants that are not currently selectable or visible', () => {
    const tree = new Map<string, string[]>([
      ['parent', ['child-1', 'child-2', 'child-3']],
      ['child-1', []],
      ['child-2', []],
      ['child-3', ['grandchild-hidden']],
      ['grandchild-hidden', []],
    ])

    const selectableIds = new Set(['parent', 'child-1', 'child-2'])

    expect(
      collectSelectableDescendantIds(
        'parent',
        (habitId) => tree.get(habitId) ?? [],
        selectableIds,
      ),
    ).toEqual(['child-1', 'child-2'])
  })
})

describe('collectVisibleHabitTreeIds', () => {
  it('collects only the ids reachable through visible children', () => {
    const visibleChildren = new Map<string, { id: string }[]>([
      ['parent', [{ id: 'child-1' }, { id: 'child-2' }]],
      ['child-1', []],
      ['child-2', []],
    ])

    expect(
      collectVisibleHabitTreeIds([{ id: 'parent' }], (habitId) => {
        return visibleChildren.get(habitId) ?? []
      }),
    ).toEqual(new Set(['parent', 'child-1', 'child-2']))
  })
})

describe('hasAncestorInSet', () => {
  const habitsById = new Map([
    ['root', { parentId: null }],
    ['parent', { parentId: 'root' }],
    ['child', { parentId: 'parent' }],
    ['grandchild', { parentId: 'child' }],
    ['other-root', { parentId: null }],
    ['other-child', { parentId: 'other-root' }],
  ])

  it('returns true when the direct parent is in the ancestor set', () => {
    expect(hasAncestorInSet('child', habitsById, new Set(['parent']))).toBe(true)
  })

  it('returns true when a grandparent is in the ancestor set', () => {
    expect(hasAncestorInSet('grandchild', habitsById, new Set(['parent']))).toBe(true)
  })

  it('returns false when matching ids are not ancestors', () => {
    expect(hasAncestorInSet('grandchild', habitsById, new Set(['other-root']))).toBe(false)
  })

  it('returns false when only the habit itself is in the set', () => {
    expect(hasAncestorInSet('child', habitsById, new Set(['child']))).toBe(false)
  })
})
