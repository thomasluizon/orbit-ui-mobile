import { describe, expect, it } from 'vitest'
import {
  buildCreateHabitRequest,
  buildSubHabitRequest,
  buildUpdateHabitRequest,
  type HabitFormData,
} from '../utils/habit-request-builders'

function makeFormData(overrides: Partial<HabitFormData> = {}): HabitFormData {
  return {
    title: 'Read',
    description: '',
    isGeneral: false,
    isFlexible: false,
    frequencyUnit: null,
    frequencyQuantity: null,
    days: [],
    dueDate: '2026-04-08',
    dueTime: '',
    dueEndTime: '',
    endDate: '',
    isBadHabit: false,
    slipAlertEnabled: false,
    reminderEnabled: false,
    scheduledReminders: [],
    checklistItems: [],
    icon: '',
    color: '',
    ...overrides,
  }
}

describe('habit-request-builders', () => {
  it('builds a flexible create request with due-time reminders', () => {
    const request = buildCreateHabitRequest(
      makeFormData({
        description: 'Daily reading',
        isFlexible: true,
        frequencyUnit: 'Week',
        frequencyQuantity: 3,
        dueTime: '08:30',
        dueEndTime: '09:00',
        reminderEnabled: true,
        checklistItems: [{ text: 'Pick a book', isChecked: false }],
      }),
      [15, 30],
      ['tag-1'],
      ['goal-1'],
      ['Chapter 1', '', 'Chapter 2'],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: false,
      description: 'Daily reading',
      dueDate: '2026-04-08',
      isFlexible: true,
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      dueTime: '08:30',
      dueEndTime: '09:00',
      reminderEnabled: true,
      reminderTimes: [15, 30],
      checklistItems: [{ text: 'Pick a book', isChecked: false }],
      tagIds: ['tag-1'],
      goalIds: ['goal-1'],
      subHabits: ['Chapter 1', 'Chapter 2'],
    })
  })

  it('builds a recurring create request with scheduled reminders and weekly days', () => {
    const request = buildCreateHabitRequest(
      makeFormData({
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
        days: ['Monday', 'Wednesday'],
        endDate: '2026-12-31',
        reminderEnabled: true,
        scheduledReminders: [{ when: 'same_day', time: '07:00' }],
      }),
      [],
      [],
      [],
      [],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: false,
      dueDate: '2026-04-08',
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      days: ['Monday', 'Wednesday'],
      endDate: '2026-12-31',
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day', time: '07:00' }],
    })
  })

  it('preserves the default timed reminder pair for create requests', () => {
    const request = buildCreateHabitRequest(
      makeFormData({
        dueTime: '10:00',
        dueEndTime: '10:30',
        reminderEnabled: true,
      }),
      [0, 15],
      [],
      [],
      [],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: false,
      dueDate: '2026-04-08',
      dueTime: '10:00',
      dueEndTime: '10:30',
      reminderEnabled: true,
      reminderTimes: [0, 15],
    })
  })

  it('builds a general bad-habit create request without schedule fields', () => {
    const request = buildCreateHabitRequest(
      makeFormData({
        isGeneral: true,
        isBadHabit: true,
        slipAlertEnabled: true,
      }),
      [],
      [],
      [],
      [],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: true,
      isGeneral: true,
      slipAlertEnabled: true,
    })
  })

  it('builds sub-habit requests for general and scheduled variants', () => {
    expect(buildSubHabitRequest(makeFormData({ isGeneral: true }), [], [])).toEqual({
      title: 'Read',
    })

    expect(
      buildSubHabitRequest(
        makeFormData({
          description: 'Warm up',
          frequencyUnit: 'Day',
          frequencyQuantity: 1,
          dueTime: '06:30',
          dueEndTime: '06:45',
          reminderEnabled: true,
          isBadHabit: true,
          slipAlertEnabled: true,
          checklistItems: [{ text: 'Stretch', isChecked: false }],
        }),
        [10],
        ['tag-2'],
      ),
    ).toEqual({
      title: 'Read',
      description: 'Warm up',
      dueDate: '2026-04-08',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueTime: '06:30',
      dueEndTime: '06:45',
      reminderEnabled: true,
      reminderTimes: [10],
      isBadHabit: true,
      slipAlertEnabled: true,
      checklistItems: [{ text: 'Stretch', isChecked: false }],
      tagIds: ['tag-2'],
    })
  })

  it('builds update requests for cleared end dates and scheduled reminders', () => {
    const request = buildUpdateHabitRequest(
      makeFormData({
        description: 'Keep the streak alive',
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        reminderEnabled: true,
        scheduledReminders: [{ when: 'same_day', time: '21:00' }],
        slipAlertEnabled: true,
        checklistItems: [{ text: 'Reflect', isChecked: true }],
      }),
      false,
      '2026-05-01',
      [],
      ['goal-1', 'goal-2'],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      description: 'Keep the streak alive',
      dueDate: '2026-04-08',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      reminderEnabled: true,
      reminderTimes: [],
      scheduledReminders: [{ when: 'same_day', time: '21:00' }],
      slipAlertEnabled: false,
      checklistItems: [{ text: 'Reflect', isChecked: true }],
      goalIds: ['goal-1', 'goal-2'],
      clearEndDate: true,
      clearIcon: true,
      clearColor: true,
    })
  })

  it('builds update requests with due-time reminders and disabled reminders fallback', () => {
    const timedRequest = buildUpdateHabitRequest(
      makeFormData({
        dueTime: '10:00',
        dueEndTime: '10:30',
        reminderEnabled: true,
        scheduledReminders: [{ when: 'same_day', time: '21:00' }],
      }),
      true,
      '',
      [0],
      [],
    )

    expect(timedRequest).toEqual({
      title: 'Read',
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2026-04-08',
      dueTime: '10:00',
      dueEndTime: '10:30',
      reminderEnabled: true,
      reminderTimes: [0],
      scheduledReminders: [],
      slipAlertEnabled: false,
      goalIds: [],
      clearIcon: true,
      clearColor: true,
    })

    const disabledReminderRequest = buildUpdateHabitRequest(
      makeFormData({
        reminderEnabled: false,
      }),
      true,
      '',
      [],
      [],
    )

    expect(disabledReminderRequest).toEqual({
      title: 'Read',
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2026-04-08',
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      slipAlertEnabled: false,
      goalIds: [],
      clearIcon: true,
      clearColor: true,
    })
  })

  it('clears due-time reminders when saving scheduled reminders in edit mode', () => {
    const request = buildUpdateHabitRequest(
      makeFormData({
        reminderEnabled: true,
        scheduledReminders: [{ when: 'day_before', time: '21:00' }],
      }),
      false,
      '',
      [0, 15],
      [],
    )

    expect(request).toEqual({
      title: 'Read',
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2026-04-08',
      frequencyUnit: undefined,
      frequencyQuantity: undefined,
      reminderEnabled: true,
      reminderTimes: [],
      scheduledReminders: [{ when: 'day_before', time: '21:00' }],
      slipAlertEnabled: false,
      goalIds: [],
      clearIcon: true,
      clearColor: true,
    })
  })

  it('forwards icon and color on create', () => {
    const request = buildCreateHabitRequest(
      makeFormData({
        icon: 'flame',
        color: '#F59E0B',
      }),
      [],
      [],
      [],
      [],
    )

    expect(request.icon).toBe('flame')
    expect(request.color).toBe('#f59e0b')
  })

  it('forwards icon and color on update, and clears them when empty', () => {
    const setRequest = buildUpdateHabitRequest(
      makeFormData({ icon: 'dumbbell', color: '#8B5CF6' }),
      false,
      '',
      [],
      [],
    )
    expect(setRequest.icon).toBe('dumbbell')
    expect(setRequest.color).toBe('#8b5cf6')
    expect(setRequest.clearIcon).toBeUndefined()
    expect(setRequest.clearColor).toBeUndefined()

    const clearRequest = buildUpdateHabitRequest(
      makeFormData(),
      false,
      '',
      [],
      [],
    )
    expect(clearRequest.icon).toBeUndefined()
    expect(clearRequest.color).toBeUndefined()
    expect(clearRequest.clearIcon).toBe(true)
    expect(clearRequest.clearColor).toBe(true)
  })

  it('computeSevenDayStrip derives cells from instances', async () => {
    const { computeSevenDayStrip } = await import('../utils/habit-card-helpers')
    const today = new Date('2026-04-10T12:00:00')
    const strip = computeSevenDayStrip(
      {
        instances: [
          { date: '2026-04-04', status: 'Completed', logId: 'a', note: null },
          { date: '2026-04-05', status: 'Overdue', logId: null, note: null },
          { date: '2026-04-08', status: 'Completed', logId: 'b', note: null },
          { date: '2026-04-10', status: 'Pending', logId: null, note: null },
        ],
      },
      today,
    )

    expect(strip).toHaveLength(7)
    expect(strip[0]?.status).toBe('done') // 2026-04-04
    expect(strip[1]?.status).toBe('missed') // 2026-04-05
    expect(strip[4]?.status).toBe('done') // 2026-04-08
    expect(strip[6]?.status).toBe('today-pending') // 2026-04-10
  })

  it('computeHabitChecklistCount returns counts or null', async () => {
    const { computeHabitChecklistCount } = await import('../utils/habit-card-helpers')
    expect(computeHabitChecklistCount({ checklistItems: [] })).toBeNull()
    expect(
      computeHabitChecklistCount({
        checklistItems: [
          { text: 'a', isChecked: true },
          { text: 'b', isChecked: false },
          { text: 'c', isChecked: true },
        ],
      }),
    ).toEqual({ checked: 2, total: 3 })
  })
})
