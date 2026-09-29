import { describe, expect, it } from 'vitest'
import {
  buildCalendarDayMap,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  determineHabitDayStatus,
  getHabitEmptyStateKey,
  hasAncestorInSet,
} from '../utils/habits'
import type { CalendarDayEntry } from '../types/calendar'
import type {
  CalendarMonthResponse,
  HabitScheduleChild,
  HabitScheduleItem,
} from '../types/habit'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'

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
        'habit-1': [{ id: 'log-1', date: '2026-04-05', value: 1, createdAtUtc: '2026-04-05T08:00:00Z' }],
      },
    }

    const dayMap = buildCalendarDayMap(
      calendarMonth,
      { from: '2026-04-01', to: '2026-04-30' },
      new Date('2026-04-05T12:00:00'),
    )

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

  it('drops lookback instances that fall before the requested range', () => {
    const overdueParent = createMockHabitScheduleItem({
      id: 'parent',
      title: 'Weekly parent',
      frequencyUnit: 'Week',
      dueDate: '2026-08-28',
      scheduledDates: ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'],
      instances: [
        { date: '2026-08-28', status: 'Overdue', logId: null },
        { date: '2026-09-04', status: 'Overdue', logId: null },
        { date: '2026-09-11', status: 'Overdue', logId: null },
        { date: '2026-09-18', status: 'Overdue', logId: null },
        { date: '2026-09-25', status: 'Overdue', logId: null },
      ],
      children: [
        createMockHabitScheduleChild({
          id: 'child',
          frequencyUnit: 'Week',
          dueDate: '2026-08-30',
          scheduledDates: ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
          instances: [
            { date: '2026-08-30', status: 'Completed', logId: 'lookback-log' },
            { date: '2026-09-06', status: 'Overdue', logId: null },
            { date: '2026-09-13', status: 'Overdue', logId: null },
            { date: '2026-09-20', status: 'Overdue', logId: null },
            { date: '2026-09-27', status: 'Overdue', logId: null },
          ],
        }),
      ],
      hasSubHabits: true,
    })

    const dayMap = buildCalendarDayMap(
      { habits: [overdueParent], logs: { parent: [] } },
      { from: '2026-09-01', to: '2026-09-30' },
      new Date('2026-09-29T12:00:00'),
    )

    expect([...dayMap.keys()]).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'])
  })

  describe('descendant logs', () => {
    const now = new Date('2026-09-29T12:00:00')
    const september = { from: '2026-09-01', to: '2026-09-30' }
    const loggedDate = '2026-09-28'

    function loggedChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
      return createMockHabitScheduleChild({
        id: 'child',
        title: 'Child',
        frequencyUnit: 'Week',
        frequencyQuantity: 3,
        dueDate: '2026-10-19',
        dueTime: '18:00',
        scheduledDates: [loggedDate],
        isLoggedInRange: true,
        instances: [{ date: loggedDate, status: 'Completed', logId: 'child-log' }],
        ...overrides,
      })
    }

    function exhaustedFlexibleParent(
      children: HabitScheduleChild[],
      overrides: Partial<HabitScheduleItem> = {},
    ): HabitScheduleItem {
      return createMockHabitScheduleItem({
        id: 'parent',
        title: 'Flexible parent',
        frequencyUnit: 'Year',
        frequencyQuantity: 1,
        isFlexible: true,
        dueDate: '2026-01-01',
        dueTime: '07:30',
        flexibleTarget: 1,
        flexibleCompleted: 1,
        children,
        hasSubHabits: children.length > 0,
        ...overrides,
      })
    }

    function subHabitEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
      return {
        habitId: 'child',
        title: 'Child',
        status: 'completed',
        isBadHabit: false,
        dueTime: '18:00',
        isOneTime: false,
        ...overrides,
      }
    }

    it('shows a child log as the sub-habit row on a day the parent has no occurrence of its own', () => {
      const dayMap = buildCalendarDayMap(
        { habits: [exhaustedFlexibleParent([loggedChild()])], logs: { parent: [] } },
        september,
        now,
      )

      expect(dayMap.get(loggedDate)).toEqual([subHabitEntry()])
      expect([...dayMap.keys()]).toEqual([loggedDate])
    })

    it('shows a grandchild log as its own row', () => {
      const child = loggedChild({
        scheduledDates: [],
        isLoggedInRange: false,
        instances: [],
        children: [loggedChild({ id: 'grandchild', title: 'Grandchild', dueTime: null })],
        hasSubHabits: true,
      })

      const dayMap = buildCalendarDayMap(
        { habits: [exhaustedFlexibleParent([child])], logs: { parent: [] } },
        september,
        now,
      )

      expect(dayMap.get(loggedDate)).toEqual([
        subHabitEntry({ habitId: 'grandchild', title: 'Grandchild', dueTime: null }),
      ])
    })

    it('shows one row per logged descendant on the same day', () => {
      const dayMap = buildCalendarDayMap(
        {
          habits: [
            exhaustedFlexibleParent([
              loggedChild(),
              loggedChild({
                id: 'second-child',
                title: 'Second child',
                frequencyUnit: null,
                frequencyQuantity: null,
                instances: [{ date: loggedDate, status: 'Completed', logId: 'second-log' }],
              }),
            ]),
          ],
          logs: { parent: [] },
        },
        september,
        now,
      )

      expect(dayMap.get(loggedDate)).toEqual([
        subHabitEntry(),
        subHabitEntry({ habitId: 'second-child', title: 'Second child', isOneTime: true }),
      ])
    })

    it('classifies each descendant log by its own habit type in a mixed-type family', () => {
      const badParent = exhaustedFlexibleParent(
        [
          loggedChild({ id: 'good-child', title: 'Good child' }),
          loggedChild({ id: 'bad-child', title: 'Bad child', isBadHabit: true }),
        ],
        { title: 'Bad parent', isBadHabit: true },
      )

      const dayMap = buildCalendarDayMap(
        { habits: [badParent], logs: { parent: [] } },
        september,
        now,
      )

      expect(dayMap.get(loggedDate)).toEqual([
        subHabitEntry({ habitId: 'good-child', title: 'Good child', isBadHabit: false }),
        subHabitEntry({ habitId: 'bad-child', title: 'Bad child', isBadHabit: true }),
      ])
    })

    it('keeps the parent occurrence as the only entry when a child logs the same day', () => {
      const parent = createMockHabitScheduleItem({
        id: 'parent',
        title: 'Weekly parent',
        frequencyUnit: 'Week',
        frequencyQuantity: 1,
        dueDate: loggedDate,
        scheduledDates: [loggedDate],
        instances: [{ date: loggedDate, status: 'Overdue', logId: null }],
        children: [loggedChild()],
        hasSubHabits: true,
      })

      const dayMap = buildCalendarDayMap({ habits: [parent], logs: { parent: [] } }, september, now)

      expect(dayMap.get(loggedDate)).toEqual([
        {
          habitId: 'parent',
          title: 'Weekly parent',
          status: 'missed',
          isBadHabit: false,
          dueTime: null,
          isOneTime: false,
        },
      ])
    })

    it('adds nothing for a child occurrence without a log', () => {
      const unloggedChild = loggedChild({
        dueDate: '2026-09-21',
        scheduledDates: ['2026-09-21'],
        isOverdue: true,
        isLoggedInRange: false,
        instances: [{ date: '2026-09-21', status: 'Overdue', logId: null }],
      })

      const dayMap = buildCalendarDayMap(
        { habits: [exhaustedFlexibleParent([unloggedChild])], logs: { parent: [] } },
        september,
        now,
      )

      expect(dayMap.size).toBe(0)
    })
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
