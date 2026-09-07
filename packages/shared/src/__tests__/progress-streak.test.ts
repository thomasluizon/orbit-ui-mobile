import { describe, expect, it } from 'vitest'
import { buildStreakWeekDays } from '../utils/streak-week'
import { buildProtectedDayLabels } from '../utils/progress'

const now = new Date(2026, 8, 7, 12)

describe('Progress streak history', () => {
  it.each([
    ['', 'en'],
    ['not-a-date', 'en'],
    ['2026-02-30', 'en'],
    ['', undefined],
    ['not-a-date', undefined],
    ['2026-02-30', undefined],
  ] as const)('omits invalid protected date %j with locale %j while retaining valid history', (invalidDate, locale) => {
    const dates = [invalidDate, '2026-09-04']
    expect(buildProtectedDayLabels(dates, now, locale, true)).toEqual([
      { id: '2026-09-07', dateLabel: locale ? 'Sep 7' : '2026-09-07', isToday: true },
      { id: '2026-09-04', dateLabel: locale ? 'Sep 4' : '2026-09-04', isToday: false },
    ])
    expect(buildProtectedDayLabels([invalidDate], now, locale)).toEqual([])
    expect(dates).toEqual([invalidDate, '2026-09-04'])
  })

  it('derives fourteen account days with all four states and keeps today open', () => {
    const days = buildStreakWeekDays({ lastActiveDate: '2026-09-06', recentFreezeDates: ['2026-09-04'] }, 4, false, now, 14)
    expect(days).toHaveLength(14)
    expect(days[0]?.dateStr).toBe('2026-08-25')
    expect(days.slice(-5).map((day) => day.status)).toEqual(['active', 'frozen', 'active', 'active', 'today'])
    expect(new Set(days.map((day) => day.status))).toEqual(new Set(['missed', 'active', 'frozen', 'today']))
  })

  it('includes protected today once and formats dates in the requested locale', () => {
    const dates = ['2026-09-04']
    const protectedDays = buildProtectedDayLabels(dates, now, 'en', true)
    expect(protectedDays.map((day) => day.id)).toEqual(['2026-09-07', '2026-09-04'])
    expect(protectedDays[0]).toEqual({ id: '2026-09-07', dateLabel: 'Sep 7', isToday: true })
    expect(buildProtectedDayLabels(['2026-09-07'], now, 'pt-BR', true)).toEqual([
      { id: '2026-09-07', dateLabel: '7 de set.', isToday: true },
    ])
    expect(buildProtectedDayLabels([], now, 'en', false)).toEqual([])
    expect(dates).toEqual(['2026-09-04'])
  })
})
