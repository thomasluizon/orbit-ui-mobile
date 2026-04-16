import { describe, expect, it } from 'vitest'
import { buildCalendarDayMap, getHabitEmptyStateKey } from '@orbit/shared/utils'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

const calendarMonth = {
  habits: [
    {
      id: 'habit-1',
      title: 'Read',
      description: null,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      isBadHabit: false,
      isCompleted: false,
      isGeneral: false,
      isFlexible: false,
      days: [],
      dueDate: '2026-04-01',
      dueTime: '08:00',
      dueEndTime: null,
      endDate: null,
      position: null,
      checklistItems: [],
      createdAtUtc: '2026-01-01T00:00:00Z',
      scheduledDates: ['2026-04-01', '2026-04-03'],
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
      instances: [],
    },
  ],
  logs: {
    'habit-1': [
      {
        id: 'log-1',
        date: '2026-04-01',
        value: 1,
        createdAtUtc: '2026-04-01T09:00:00Z',
      },
    ],
  },
} satisfies CalendarMonthResponse

describe('habit utils', () => {
  it('returns the same empty-state keys used by web', () => {
    expect(getHabitEmptyStateKey('today')).toBe('habits.noDueToday')
    expect(getHabitEmptyStateKey('all')).toBe('habits.noHabitsYet')
    expect(getHabitEmptyStateKey('general')).toBe('habits.emptyGeneral')
  })

  it('builds calendar day entries from scheduled dates when instances are empty', () => {
    const map = buildCalendarDayMap(calendarMonth, new Date('2026-04-02T12:00:00Z'))

    expect(map.get('2026-04-01')).toEqual([
      {
        habitId: 'habit-1',
        title: 'Read',
        status: 'completed',
        isBadHabit: false,
        dueTime: '08:00',
        isOneTime: false,
      },
    ])

    expect(map.get('2026-04-03')).toEqual([
      {
        habitId: 'habit-1',
        title: 'Read',
        status: 'upcoming',
        isBadHabit: false,
        dueTime: '08:00',
        isOneTime: false,
      },
    ])
  })
})
