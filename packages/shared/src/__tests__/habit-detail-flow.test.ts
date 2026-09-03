import { describe, expect, it } from 'vitest'
import type { HabitLog } from '../types/calendar'
import type { HabitMetrics } from '../types/habit'
import {
  appendHabitDetailChild,
  buildHabitDetailSchedulePatch,
  buildHabitDetailUpdateRequest,
  buildHabitDetailChildDateModel,
  buildHabitHistoryMonth,
  buildHabitStripModel,
  canNavigateHabitHistoryBack,
  canNavigateHabitHistoryForward,
  formatHabitDetailReminderValue,
  isHabitCompletedOnDate,
  isHabitHistoryMonthLoaded,
  isHabitSlipping,
  mergeHabitDetailWithScopedHabit,
  removeHabitDetailChild,
  shouldResetHabitChecklist,
  shouldShowHabitMetrics,
} from '../utils/habit-detail-flow'
import { createMockHabit } from './factories'
import {
  makeHabitDetail,
  makeHabitDetailScopedParent,
} from '../test-support/habit-detail-fixtures'

const recurring = {
  createdAtUtc: '2026-01-01T12:00:00Z',
  days: ['Monday', 'Wednesday', 'Friday'],
  dueDate: '2026-08-28',
  endDate: null,
  frequencyQuantity: 1,
  frequencyUnit: 'Week',
  isBadHabit: false,
  isGeneral: false,
  isFlexible: false,
}
const today = new Date(2026, 7, 28)
const log = (date: string, createdAtUtc = `${date}T12:00:00Z`): HabitLog => ({
  id: date,
  date,
  value: 1,
  createdAtUtc,
})

describe('habit detail flow model', () => {
  it('appends and removes children in a mounted detail tree', () => {
    const parent = { ...createMockHabit({ id: 'parent-1', isGeneral: true }), children: [] }
    const withChild = appendHabitDetailChild(parent, 'offline-child-1', {
      title: 'Warmup',
      dueDate: '',
      checklistItems: [{ text: 'Shoes', isChecked: false }],
    })

    expect(withChild.children[0]).toMatchObject({
      id: 'offline-child-1',
      title: 'Warmup',
      dueDate: parent.dueDate,
      isGeneral: true,
      position: 0,
    })
    expect(removeHabitDetailChild(withChild, 'offline-child-1').children).toEqual([])
  })

  it('removes a nested child without dropping its ancestors', () => {
    const nested = { ...createMockHabit({ id: 'nested-1' }), children: [] }
    const child = { ...createMockHabit({ id: 'child-1' }), children: [nested] }
    const parent = { ...createMockHabit({ id: 'parent-1' }), children: [child] }

    expect(removeHabitDetailChild(parent, 'nested-1').children[0]?.children).toEqual([])
  })

  it('omits unowned fields from inline updates and includes explicit values', () => {
    const habit = createMockHabit({
      slipAlertEnabled: true,
      linkedGoals: [{ id: 'goal-1', title: 'Read more' }],
    })

    const rename = buildHabitDetailUpdateRequest(habit, { title: 'Read daily' })
    expect(rename).not.toHaveProperty('slipAlertEnabled')
    expect(rename).not.toHaveProperty('goalIds')

    expect(buildHabitDetailUpdateRequest(habit, { slipAlertEnabled: false }))
      .toMatchObject({ slipAlertEnabled: false })
    expect(buildHabitDetailUpdateRequest(habit, { goalIds: [] }))
      .toMatchObject({ goalIds: [] })
  })

  it('builds schedule, reminder, and text field updates without dropping habit data', () => {
    const habit = createMockHabit({
      description: 'Old description',
      dueTime: '08:00',
      reminderEnabled: true,
      reminderTimes: [15],
    })
    const scheduledReminders = [{ time: '20:30', when: 'same_day' as const }]
    const request = buildHabitDetailUpdateRequest(habit, {
      description: 'New description',
      dueTime: '09:15',
      endDate: '2026-12-31',
      frequencyUnit: 'Day',
      frequencyQuantity: 2,
      days: ['Tuesday', 'Thursday'],
      reminderEnabled: true,
      reminderTimes: [30],
      scheduledReminders,
    })

    expect(request).toMatchObject({
      title: habit.title,
      description: 'New description',
      dueTime: '09:15',
      endDate: '2026-12-31',
      frequencyUnit: 'Day',
      frequencyQuantity: 2,
      days: ['Tuesday', 'Thursday'],
      reminderEnabled: true,
      reminderTimes: [30],
      scheduledReminders,
    })
  })

  it('uses the explicit API signal when an inline edit clears the end date', () => {
    const habit = createMockHabit({ endDate: '2026-12-31' })

    expect(buildHabitDetailUpdateRequest(habit, { endDate: null })).toMatchObject({
      endDate: null,
      clearEndDate: true,
    })
  })

  it('builds valid inline schedule patches and clears non-daily weekdays', () => {
    expect(buildHabitDetailSchedulePatch('Day', 0, ['Monday'])).toEqual({
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday'],
    })
    expect(buildHabitDetailSchedulePatch('Week', 3, ['Monday'])).toEqual({
      frequencyUnit: 'Week',
      frequencyQuantity: 3,
      days: [],
    })
  })

  it('lists the actual reminder offsets and scheduled times', () => {
    const translate = (key: string) => key
    expect(formatHabitDetailReminderValue({
      reminderEnabled: false,
      reminderTimes: [10],
      scheduledReminders: [],
    }, translate)).toBe('habits.detail.noValue')
    expect(formatHabitDetailReminderValue({
      reminderEnabled: true,
      reminderTimes: [10, 30],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }, translate)).toBe('habits.form.reminder10min, habits.form.reminder30min, 08:00')
    expect(formatHabitDetailReminderValue({
      reminderEnabled: true,
      reminderTimes: [],
      scheduledReminders: [],
    }, translate)).toBe('habits.detail.noValue')
  })

  it('merges scoped relationship and selected-date state into detail data', () => {
    const detail = makeHabitDetail()
    const scoped = makeHabitDetailScopedParent()
    const merged = mergeHabitDetailWithScopedHabit(detail, scoped, '2026-08-28')

    expect(merged).toMatchObject({
      title: detail.title,
      tags: scoped.tags,
      linkedGoals: scoped.linkedGoals,
      instances: scoped.instances,
    })
    expect(mergeHabitDetailWithScopedHabit(detail, undefined, '2026-08-28').title)
      .toBe(detail.title)
  })

  it('builds a 30 day habit strip without a frozen state', () => {
    const model = buildHabitStripModel(recurring, [log('2026-08-28')], today, 'en')
    expect(model.days).toHaveLength(30)
    expect(model.days.at(-1)).toBe('done')
    expect(model.days).not.toContain('frozen')
  })

  it('derives slipping from zero streak, a fallen rate, and three days without logs', () => {
    const metrics: HabitMetrics = {
      currentStreak: 0,
      longestStreak: 12,
      weeklyCompletionRate: 0,
      monthlyCompletionRate: 41,
      totalCompletions: 12,
      lastCompletedDate: '2026-08-20',
    }
    expect(isHabitSlipping(recurring, metrics, [log('2026-08-20')], today)).toBe(true)
    expect(isHabitSlipping(recurring, metrics, [log('2026-08-27')], today)).toBe(false)
  })

  it('treats clean bad-habit dates as resistance and positive logs as slips', () => {
    const badHabit = {
      ...recurring,
      createdAtUtc: '2026-07-30T12:00:00Z',
      days: [],
      frequencyUnit: 'Day',
      isBadHabit: true,
    }
    const slip = log('2026-08-28')
    const withSlip = buildHabitStripModel(badHabit, [slip], today, 'en')
    const slipHistory = buildHabitHistoryMonth(badHabit, [slip], today, today, 1)

    expect(withSlip.days.at(-1)).toBe('missed')
    expect(withSlip.days.filter((outcome) => outcome === 'done')).toHaveLength(29)
    expect(Math.round((29 / 30) * 10_000) / 100).toBe(96.67)
    expect(slipHistory.find((day) => day.dateStr === '2026-08-28')?.outcome).toBe('none')
    expect(isHabitCompletedOnDate(badHabit, [slip], '2026-08-28')).toBe(false)

    const clean = buildHabitStripModel(badHabit, [], today, 'en')
    const cleanHistory = buildHabitHistoryMonth(badHabit, [], today, today, 1)
    expect(clean.days.at(-1)).toBe('done')
    expect(clean.days.filter((outcome) => outcome === 'done')).toHaveLength(30)
    expect((30 / 30) * 100).toBe(100)
    expect(cleanHistory.find((day) => day.dateStr === '2026-08-28')?.outcome).toBe('full')
    expect(isHabitCompletedOnDate(badHabit, [], '2026-08-28')).toBe(true)
  })

  it('uses recent bad-habit logs as the slipping signal', () => {
    const metrics: HabitMetrics = {
      currentStreak: 0,
      longestStreak: 12,
      weeklyCompletionRate: 0,
      monthlyCompletionRate: 41,
      totalCompletions: 12,
      lastCompletedDate: '2026-08-20',
    }
    const badHabit = { ...recurring, isBadHabit: true }

    expect(isHabitSlipping(badHabit, metrics, [log('2026-08-27')], today)).toBe(true)
    expect(isHabitSlipping(badHabit, metrics, [log('2026-08-20')], today)).toBe(false)
  })

  it('draws month outcomes from real logs and marks future and outside days', () => {
    const days = buildHabitHistoryMonth(recurring, [log('2026-08-28')], today, today, 1)
    expect(days).toHaveLength(42)
    expect(days.find((day) => day.dateStr === '2026-08-28')?.outcome).toBe('full')
    expect(days.some((day) => day.outsideMonth)).toBe(true)
    expect(days.some((day) => day.outcome === 'future')).toBe(true)
  })

  it('shows real logs for unscheduled and general history without inventing misses', () => {
    const general = {
      ...recurring,
      days: [],
      frequencyUnit: null,
      frequencyQuantity: null,
      isGeneral: true,
    }
    const model = buildHabitStripModel(general, [log('2026-08-28')], today, 'en')
    expect(model.days.at(-1)).toBe('done')
    expect(model.days.at(-2)).toBe('not-scheduled')
  })

  it('preserves non-unit daily and weekly cadence around the due-date anchor', () => {
    const everyOtherDay = {
      ...recurring,
      days: [],
      dueDate: '2026-08-28',
      frequencyUnit: 'Day',
      frequencyQuantity: 2,
    }
    const daily = buildHabitHistoryMonth(everyOtherDay, [], today, today, 1)
    expect(daily.find((day) => day.dateStr === '2026-08-26')?.outcome).toBe('none')
    expect(daily.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('not-scheduled')

    const everyOtherWeek = {
      ...recurring,
      days: ['Monday'],
      dueDate: '2026-08-24',
      frequencyQuantity: 2,
    }
    const weekly = buildHabitHistoryMonth(everyOtherWeek, [], today, today, 1)
    expect(weekly.find((day) => day.dateStr === '2026-08-24')?.outcome).toBe('none')
    expect(weekly.find((day) => day.dateStr === '2026-08-17')?.outcome).toBe('not-scheduled')
    expect(weekly.find((day) => day.dateStr === '2026-08-10')?.outcome).toBe('none')
  })

  it('preserves non-unit monthly cadence while clamping short months', () => {
    const everyOtherMonth = {
      ...recurring,
      createdAtUtc: '2026-01-31T12:00:00Z',
      days: [],
      dueDate: '2026-01-31',
      frequencyUnit: 'Month',
      frequencyQuantity: 2,
    }
    const february = buildHabitHistoryMonth(
      everyOtherMonth,
      [],
      new Date(2026, 1, 1),
      new Date(2026, 3, 1),
      1,
    )
    expect(february.find((day) => day.dateStr === '2026-02-28')?.outcome).toBe('not-scheduled')

    const march = buildHabitHistoryMonth(
      everyOtherMonth,
      [],
      new Date(2026, 2, 1),
      new Date(2026, 3, 1),
      1,
    )
    expect(march.find((day) => day.dateStr === '2026-03-31')?.outcome).toBe('none')
    expect(march.find((day) => day.dateStr === '2026-03-30')?.outcome).toBe('not-scheduled')
  })

  it('preserves non-unit yearly cadence and maps leap-day anchors in common years', () => {
    const everyOtherYear = {
      ...recurring,
      createdAtUtc: '2024-01-01T12:00:00Z',
      days: [],
      dueDate: '2024-02-29',
      frequencyUnit: 'Year',
      frequencyQuantity: 2,
    }
    const leapYear = buildHabitHistoryMonth(
      everyOtherYear,
      [],
      new Date(2024, 1, 1),
      new Date(2024, 2, 1),
      1,
    )
    expect(leapYear.find((day) => day.dateStr === '2024-02-29')?.outcome).toBe('none')

    const skippedYear = buildHabitHistoryMonth(
      everyOtherYear,
      [],
      new Date(2025, 1, 1),
      new Date(2025, 2, 1),
      1,
    )
    expect(skippedYear.find((day) => day.dateStr === '2025-02-28')?.outcome).toBe('not-scheduled')

    const commonYear = buildHabitHistoryMonth(
      everyOtherYear,
      [],
      new Date(2026, 1, 1),
      new Date(2026, 2, 1),
      1,
    )
    expect(commonYear.find((day) => day.dateStr === '2026-02-28')?.outcome).toBe('none')
    expect(commonYear.find((day) => day.dateStr === '2026-02-27')?.outcome).toBe('not-scheduled')
  })

  it('keeps one-time, flexible, creation, and end schedule bounds distinct', () => {
    const oneTime = buildHabitHistoryMonth(
      {
        ...recurring,
        days: [],
        dueDate: '2026-08-28',
        frequencyUnit: null,
        frequencyQuantity: null,
      },
      [],
      today,
      today,
      1,
    )
    expect(oneTime.find((day) => day.dateStr === '2026-08-28')?.outcome).toBe('none')
    expect(oneTime.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('not-scheduled')

    const flexibleHabit = {
      ...recurring,
      days: [],
      dueDate: '2026-08-24',
      frequencyQuantity: 3,
      flexibleTarget: 3,
      isFlexible: true,
    }
    const satisfiedLogs = [log('2026-08-24'), log('2026-08-25'), log('2026-08-26')]
    const flexible = buildHabitHistoryMonth(flexibleHabit, satisfiedLogs, today, today, 1)
    const flexibleStrip = buildHabitStripModel(flexibleHabit, satisfiedLogs, today, 'en', 1)
    expect(flexible.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('not-scheduled')
    expect(flexibleStrip.days.at(-2)).toBe('not-scheduled')

    const unmetLogs = satisfiedLogs.slice(0, 2)
    const unmet = buildHabitHistoryMonth(flexibleHabit, unmetLogs, today, today, 1)
    expect(unmet.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('none')

    const bounded = buildHabitHistoryMonth(
      {
        ...recurring,
        createdAtUtc: '2026-08-27T12:00:00Z',
        days: [],
        endDate: '2026-08-27',
        frequencyUnit: 'Day',
      },
      [],
      today,
      today,
      1,
    )
    expect(bounded.find((day) => day.dateStr === '2026-08-26')?.outcome).toBe('not-scheduled')
    expect(bounded.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('none')
    expect(bounded.find((day) => day.dateStr === '2026-08-28')?.outcome).toBe('not-scheduled')
  })

  it.each([
    {
      frequencyUnit: 'Month',
      logs: [log('2026-08-01'), log('2026-08-15')],
    },
    {
      frequencyUnit: 'Year',
      logs: [log('2026-01-15'), log('2026-07-15')],
    },
  ])('keeps unlogged dates neutral in a satisfied flexible $frequencyUnit window', ({ frequencyUnit, logs }) => {
    const flexible = {
      ...recurring,
      days: [],
      dueDate: '2026-01-01',
      flexibleTarget: null,
      frequencyQuantity: 2,
      frequencyUnit,
      isFlexible: true,
    }
    const history = buildHabitHistoryMonth(flexible, logs, today, today, 1)

    expect(history.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('not-scheduled')
  })

  it('keeps flexible day targets isolated to their own date', () => {
    const flexibleDaily = {
      ...recurring,
      days: [],
      dueDate: '2026-08-01',
      flexibleTarget: 2,
      frequencyQuantity: 2,
      frequencyUnit: 'Day',
      isFlexible: true,
    }
    const sameDayLogs = [log('2026-08-27', '2026-08-27T08:00:00Z'), {
      ...log('2026-08-27', '2026-08-27T18:00:00Z'),
      id: '2026-08-27-evening',
    }]
    const history = buildHabitHistoryMonth(flexibleDaily, sameDayLogs, today, today, 1)

    expect(history.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('full')
    expect(history.find((day) => day.dateStr === '2026-08-26')?.outcome).toBe('none')
  })

  it('reduces a flexible period target for skip logs', () => {
    const flexibleWeekly = {
      ...recurring,
      days: [],
      dueDate: '2026-08-24',
      flexibleTarget: 2,
      frequencyQuantity: 2,
      isFlexible: true,
    }
    const skipped = { ...log('2026-08-25'), value: 0 }
    const history = buildHabitHistoryMonth(
      flexibleWeekly,
      [log('2026-08-24'), skipped],
      today,
      today,
      1,
    )

    expect(history.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('not-scheduled')
  })

  it('subtracts a flexible window skip once from the invariant target', () => {
    const flexibleWeekly = {
      ...recurring,
      days: [],
      dueDate: '2026-08-24',
      flexibleTarget: 1,
      frequencyQuantity: 2,
      isFlexible: true,
    }
    const skipped = { ...log('2026-08-25'), value: 0 }
    const history = buildHabitHistoryMonth(flexibleWeekly, [skipped], today, today, 1)

    expect(history.find((day) => day.dateStr === '2026-08-27')?.outcome).toBe('none')
  })

  it('does not reuse a selected window target in an unrelated flexible window', () => {
    const flexibleWeekly = {
      ...recurring,
      days: [],
      dueDate: '2026-08-17',
      flexibleTarget: 1,
      frequencyQuantity: 2,
      isFlexible: true,
    }
    const selectedWindowSkip = { ...log('2026-08-25'), value: 0 }
    const history = buildHabitHistoryMonth(
      flexibleWeekly,
      [log('2026-08-17'), selectedWindowSkip],
      today,
      today,
      1,
    )

    expect(history.find((day) => day.dateStr === '2026-08-20')?.outcome).toBe('none')
  })

  it('clamps monthly anchors and respects creation and end boundaries', () => {
    const monthly = {
      ...recurring,
      createdAtUtc: '2026-01-31T12:00:00Z',
      days: [],
      dueDate: '2026-01-31',
      endDate: '2026-03-31',
      frequencyUnit: 'Month',
      frequencyQuantity: 1,
    }
    const february = buildHabitHistoryMonth(
      monthly,
      [],
      new Date(2026, 1, 1),
      new Date(2026, 1, 28),
      1,
    )
    expect(february.find((day) => day.dateStr === '2026-02-28')?.outcome).toBe('none')
    expect(february.find((day) => day.dateStr === '2026-02-27')?.outcome).toBe('not-scheduled')

    const april = buildHabitHistoryMonth(monthly, [], new Date(2026, 3, 1), new Date(2026, 3, 30), 1)
    expect(april.find((day) => day.dateStr === '2026-04-30')?.outcome).toBe('not-scheduled')
  })

  it('does not infer monthly history from a due date that has advanced', () => {
    const movedMonthly = {
      ...recurring,
      createdAtUtc: '2026-01-01T12:00:00Z',
      days: [],
      dueDate: '2026-02-28',
      frequencyUnit: 'Month',
    }
    const january = buildHabitHistoryMonth(
      movedMonthly,
      [log('2026-01-31')],
      new Date(2026, 0, 1),
      new Date(2026, 2, 1),
      1,
    )

    expect(january.find((day) => day.dateStr === '2026-01-31')?.outcome).toBe('full')
    expect(january.find((day) => day.dateStr === '2026-01-28')?.outcome).toBe('not-scheduled')
    expect(january.filter((day) => day.outcome === 'none')).toHaveLength(0)
  })

  it('does not infer monthly history from an advanced due date without logs', () => {
    const movedMonthly = {
      ...recurring,
      createdAtUtc: '2026-01-01T12:00:00Z',
      days: [],
      dueDate: '2026-02-28',
      frequencyUnit: 'Month',
    }
    const january = buildHabitHistoryMonth(
      movedMonthly,
      [],
      new Date(2026, 0, 1),
      new Date(2026, 2, 1),
      1,
    )

    expect(january.find((day) => day.dateStr === '2026-01-28')?.outcome).toBe('not-scheduled')
    expect(january.filter((day) => day.outcome === 'none')).toHaveLength(0)
  })

  it('does not invent a common-year occurrence from an advanced leap-day due date', () => {
    const movedYearly = {
      ...recurring,
      createdAtUtc: '2024-01-01T12:00:00Z',
      days: [],
      dueDate: '2025-02-28',
      frequencyUnit: 'Year',
    }
    const february = buildHabitHistoryMonth(
      movedYearly,
      [log('2024-02-29')],
      new Date(2024, 1, 1),
      new Date(2024, 11, 31),
      1,
    )

    expect(february.find((day) => day.dateStr === '2024-02-29')?.outcome).toBe('full')
    expect(february.find((day) => day.dateStr === '2024-02-28')?.outcome).toBe('not-scheduled')
    expect(february.filter((day) => day.outcome === 'none')).toHaveLength(0)
  })

  it('does not infer yearly history from an advanced due date without logs', () => {
    const movedYearly = {
      ...recurring,
      createdAtUtc: '2024-01-01T12:00:00Z',
      days: [],
      dueDate: '2025-02-28',
      frequencyUnit: 'Year',
    }
    const february = buildHabitHistoryMonth(
      movedYearly,
      [],
      new Date(2024, 1, 1),
      new Date(2024, 11, 31),
      1,
    )

    expect(february.find((day) => day.dateStr === '2024-02-28')?.outcome).toBe('not-scheduled')
    expect(february.filter((day) => day.outcome === 'none')).toHaveLength(0)
  })

  it('keeps reconstructing a monthly habit whose due date has not advanced', () => {
    const pendingMonthly = {
      ...recurring,
      createdAtUtc: '2026-01-01T12:00:00Z',
      days: [],
      dueDate: '2026-01-31',
      frequencyUnit: 'Month',
    }
    const february = buildHabitHistoryMonth(
      pendingMonthly,
      [],
      new Date(2026, 1, 1),
      new Date(2026, 1, 28),
      1,
    )

    expect(february.find((day) => day.dateStr === '2026-02-28')?.outcome).toBe('none')
    expect(february.find((day) => day.dateStr === '2026-02-27')?.outcome).toBe('not-scheduled')
  })

  it('bounds loaded history to the API window and navigation to start and current months', () => {
    expect(isHabitHistoryMonthLoaded(new Date(2025, 6, 1), today)).toBe(false)
    expect(isHabitHistoryMonthLoaded(new Date(2025, 7, 1), today)).toBe(true)
    expect(isHabitHistoryMonthLoaded(new Date(2026, 7, 1), today)).toBe(true)
    expect(canNavigateHabitHistoryBack(new Date(2026, 7, 1), '2026-07-03T12:00:00Z')).toBe(true)
    expect(canNavigateHabitHistoryBack(new Date(2026, 6, 1), '2026-07-03T12:00:00Z')).toBe(false)
    expect(canNavigateHabitHistoryForward(new Date(2026, 6, 1), today)).toBe(true)
    expect(canNavigateHabitHistoryForward(new Date(2026, 7, 1), today)).toBe(false)
  })

  it('shows metrics and reset copy only where the backend rules apply', () => {
    expect(shouldShowHabitMetrics({ frequencyUnit: null, isGeneral: false })).toBe(false)
    expect(shouldShowHabitMetrics({ frequencyUnit: null, isGeneral: true })).toBe(true)
    expect(shouldResetHabitChecklist({ frequencyUnit: 'Day', isFlexible: false })).toBe(true)
    expect(shouldResetHabitChecklist({ frequencyUnit: 'Day', isFlexible: true })).toBe(false)
  })

  it('derives child completion only from selected-date schedule data', () => {
    const detailChild = createMockHabit({
      id: 'child-1',
      isCompleted: true,
      scheduledDates: [],
      instances: [],
    })
    const historical = buildHabitDetailChildDateModel(
      detailChild,
      createMockHabit({
        id: 'child-1',
        isCompleted: false,
        isLoggedInRange: true,
        scheduledDates: ['2026-08-26'],
        instances: [{ date: '2026-08-26', status: 'Completed', logId: 'log-1' }],
      }),
      '2026-08-26',
      '2026-08-28',
    )
    expect(historical.completed).toBe(true)
    expect(historical.habit.isCompleted).toBe(true)
    expect(historical.canLog).toBe(true)

    const unscoped = buildHabitDetailChildDateModel(
      detailChild,
      undefined,
      '2026-08-27',
      '2026-08-28',
    )
    expect(unscoped.completed).toBe(false)
    expect(unscoped.habit.isCompleted).toBe(false)
    expect(unscoped.canLog).toBe(false)
  })

  it('marks only pre-cutoff days unavailable in the overlapping month', () => {
    const daily = {
      ...recurring,
      createdAtUtc: '2025-01-01T12:00:00Z',
      days: [],
      frequencyUnit: 'Day',
    }
    const overlap = buildHabitHistoryMonth(
      daily,
      [log('2025-08-29')],
      new Date(2025, 7, 1),
      today,
      1,
    )

    expect(overlap.find((day) => day.dateStr === '2025-08-27')?.outcome).toBe('unavailable')
    expect(overlap.find((day) => day.dateStr === '2025-08-28')?.outcome).toBe('none')
    expect(overlap.find((day) => day.dateStr === '2025-08-29')?.outcome).toBe('full')
  })

  it('distinguishes recurring child instances from range completion', () => {
    const detailChild = createMockHabit({
      id: 'recurring-child',
      scheduledDates: ['2026-08-26'],
      instances: [],
    })
    const completedByInstance = buildHabitDetailChildDateModel(
      detailChild,
      createMockHabit({
        ...detailChild,
        isLoggedInRange: false,
        instances: [{ date: '2026-08-26', status: 'Completed', logId: 'log-1' }],
      }),
      '2026-08-26',
      '2026-08-28',
    )
    expect(completedByInstance.completed).toBe(true)

    const completedByRange = buildHabitDetailChildDateModel(
      detailChild,
      createMockHabit({
        ...detailChild,
        isLoggedInRange: true,
        instances: [{ date: '2026-08-25', status: 'Completed', logId: 'log-2' }],
      }),
      '2026-08-26',
      '2026-08-28',
    )
    expect(completedByRange.completed).toBe(true)

    const incomplete = buildHabitDetailChildDateModel(
      detailChild,
      createMockHabit({
        ...detailChild,
        isLoggedInRange: false,
        instances: [{ date: '2026-08-26', status: 'Pending', logId: null }],
      }),
      '2026-08-26',
      '2026-08-28',
    )
    expect(incomplete.completed).toBe(false)
  })

  it('keeps future one-time children editable and recurring children read-only', () => {
    const oneTimeChild = createMockHabit({
      id: 'one-time-child',
      dueDate: '2026-08-29',
      frequencyUnit: null,
      frequencyQuantity: null,
      scheduledDates: ['2026-08-29'],
    })
    const oneTime = buildHabitDetailChildDateModel(
      oneTimeChild,
      oneTimeChild,
      '2026-08-29',
      '2026-08-28',
    )
    expect(oneTime.canLog).toBe(true)
    expect(oneTime.readOnly).toBe(false)

    const recurringChild = createMockHabit({
      id: 'recurring-child',
      dueDate: '2026-08-29',
      scheduledDates: ['2026-08-29'],
    })
    const recurringFuture = buildHabitDetailChildDateModel(
      recurringChild,
      recurringChild,
      '2026-08-29',
      '2026-08-28',
    )
    expect(recurringFuture.canLog).toBe(false)
    expect(recurringFuture.readOnly).toBe(true)

    const recurringHistory = buildHabitDetailChildDateModel(
      recurringChild,
      recurringChild,
      '2026-08-20',
      '2026-08-28',
    )
    expect(recurringHistory.canLog).toBe(false)
    expect(recurringHistory.readOnly).toBe(true)
  })

  it.each(['2026-08-28', '2026-08-26'])(
    'preserves selected-date completion for a general child on %s',
    (dateStr) => {
      const generalChild = createMockHabit({
        id: 'general-child',
        frequencyUnit: null,
        frequencyQuantity: null,
        isGeneral: true,
        scheduledDates: [],
        instances: [],
      })
      const model = buildHabitDetailChildDateModel(
        generalChild,
        createMockHabit({
          ...generalChild,
          isCompleted: true,
          isLoggedInRange: false,
        }),
        dateStr,
        '2026-08-28',
      )

      expect(model.completed).toBe(true)
      expect(model.habit.isCompleted).toBe(true)
      expect(model.canLog).toBe(true)
      expect(model.readOnly).toBe(false)
    },
  )

  it('preserves incomplete general child state', () => {
    const generalChild = createMockHabit({
      id: 'general-child',
      frequencyUnit: null,
      frequencyQuantity: null,
      isGeneral: true,
      isCompleted: false,
      scheduledDates: [],
      instances: [],
    })
    const model = buildHabitDetailChildDateModel(
      generalChild,
      generalChild,
      '2026-08-28',
      '2026-08-28',
    )

    expect(model.completed).toBe(false)
    expect(model.habit.isCompleted).toBe(false)
    expect(model.canLog).toBe(true)
    expect(model.readOnly).toBe(false)
  })
})
