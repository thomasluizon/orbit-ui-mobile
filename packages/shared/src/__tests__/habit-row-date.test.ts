import { describe, expect, it } from 'vitest'
import { createMockHabit } from './factories'
import { makeMonthlyChildDaySchedule } from '../test-support/habit-detail-fixtures'
import { normalizeHabitQueryData } from '../utils/habit-normalization'
import { buildHabitRowDateModel } from '../utils/habit-row-status'
import { canLogHabitOnDate } from '../utils/habit-card-helpers'
import { createHabitVisibilityHelpers } from '../utils/habit-visibility'

const date = '2026-11-01'

describe('habit row date availability', () => {
  it('retains the check when no schedule after the viewed day is known', () => {
    const habit = createMockHabit({ scheduledDates: [], instances: [] })
    expect(buildHabitRowDateModel(habit, date, date)).toMatchObject({
      dateStatusKey: undefined, completionStatusUnavailable: false, completionReadOnly: false,
    })
  })

  it('keeps an old scheduled day loggable after the next occurrence moves forward', () => {
    const habit = createMockHabit({ dueDate: '2026-12-01', scheduledDates: [date] })
    expect(buildHabitRowDateModel(habit, date, '2026-11-07')).toMatchObject({
      canLog: true, dateStatusKey: undefined, completionStatusUnavailable: false, completionReadOnly: false,
    })
  })

  it('does not apply date availability outside a day scope', () => {
    const query = normalizeHabitQueryData([makeMonthlyChildDaySchedule()])
    expect(buildHabitRowDateModel(query.habitsById.get('child-1')!, undefined, date)).toMatchObject({
      dateStatusKey: undefined, completionStatusUnavailable: false, completionReadOnly: false,
    })
  })

  it('keeps skipped children out of Hoje and exposes their status in Todos', () => {
    const query = normalizeHabitQueryData([makeMonthlyChildDaySchedule()])
    const visibility = createHabitVisibilityHelpers({ ...query, selectedDate: date, searchQuery: '', showCompleted: true, recentlyCompletedIds: new Set() })
    expect(visibility.getVisibleChildren('habit-1', 'today').map((child) => child.id)).toEqual(['child-2'])
    expect(visibility.getVisibleChildren('habit-1', 'all').map((child) => child.id)).toEqual(['child-1', 'child-2'])
    expect(buildHabitRowDateModel(query.habitsById.get('child-1')!, date, date)).toMatchObject({
      canLog: false, completionReadOnly: true, completionStatusUnavailable: true, dateStatusKey: 'habits.statusDot.skip',
    })
  })

  it.each([
    { frequencyUnit: 'Month', isFlexible: false },
    { frequencyUnit: 'Week', isFlexible: true },
  ] as const)('blocks a skipped $frequencyUnit occurrence even when scheduled', (schedule) => {
    const habit = createMockHabit({ ...schedule, isSkippedOnDate: true, scheduledDates: [date] })
    expect(canLogHabitOnDate(habit, date, date)).toBe(false)
    expect(buildHabitRowDateModel(habit, date, date).dateStatusKey).toBe('habits.statusDot.skip')
  })

  it.each([
    { isLoggedInRange: true },
    { isCompleted: true },
    { isOverdue: true },
    { isGeneral: true, frequencyUnit: null },
    { isFlexible: true },
    { frequencyUnit: null },
    { scheduledDates: [date] },
  ])('retains the completion presentation for %j', (overrides) => {
    const habit = createMockHabit({ dueDate: '2026-12-01', scheduledDates: [], instances: [], ...overrides })
    expect(buildHabitRowDateModel(habit, date, date)).toMatchObject({
      dateStatusKey: undefined, completionStatusUnavailable: false, completionReadOnly: false,
    })
  })

  it('keeps a scheduled future occurrence read-only with its normal check', () => {
    const habit = createMockHabit({ scheduledDates: ['2026-11-02'] })
    expect(buildHabitRowDateModel(habit, '2026-11-02', date)).toMatchObject({
      canLog: false, completionReadOnly: true, completionStatusUnavailable: false,
      dateStatusKey: undefined, completionReasonKey: 'habits.todayBoundary.future',
    })
  })
})
