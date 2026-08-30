import { describe, expect, it } from 'vitest'
import type { HabitLog } from '../types/calendar'
import type { HabitMetrics } from '../types/habit'
import {
  buildHabitDetailChildDateModel,
  buildHabitHistoryMonth,
  buildHabitStripModel,
  canNavigateHabitHistoryBack,
  canNavigateHabitHistoryForward,
  isHabitCompletedOnDate,
  isHabitHistoryMonthLoaded,
  isHabitSlipping,
  shouldResetHabitChecklist,
  shouldShowHabitMetrics,
} from '../utils/habit-detail-flow'
import { createMockHabit } from './factories'

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
