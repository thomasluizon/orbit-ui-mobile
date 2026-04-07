import { describe, expect, it } from 'vitest'
import {
  buildCalendarDayMap,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  determineHabitDayStatus,
  getHabitEmptyStateKey,
  hasAncestorInSet,
} from '../utils/habits'
import type { CalendarMonthResponse } from '../types/habit'

describe('getHabitEmptyStateKey', () => {
  it('returns the general key for general view', () => {
    expect(getHabitEmptyStateKey('general')).toBe('habits.emptyGeneral')
  })

  it('returns the today key for today view', () => {
    expect(getHabitEmptyStateKey('today')).toBe('habits.noDueToday')
  })

  it('returns the all key for all view', () => {
    expect(getHabitEmptyStateKey('all')).toBe('habits.noHabitsYet')
  })
})

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
  it('builds entries with statuses, due time, and one-time flag', () => {
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
          scheduledDates: ['2026-04-05', '2026-04-06'],
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
        'habit-1': [{ id: 'log-1', date: '2026-04-05', value: 1, note: null, createdAtUtc: '2026-04-05T08:00:00Z' }],
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
        habitId: 'habit-2',
        title: 'Passport renewal',
        status: 'missed',
        isBadHabit: false,
        dueTime: null,
        isOneTime: true,
      },
    ])
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
