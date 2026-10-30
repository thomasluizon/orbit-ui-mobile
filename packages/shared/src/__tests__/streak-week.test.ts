import { describe, expect, it } from 'vitest'
import { buildStreakWeekDays } from '../utils/streak-week'

const NOW = new Date(2026, 5, 12, 11, 29, 0)

describe('buildStreakWeekDays', () => {
  it('returns the last 7 days ending today', () => {
    const days = buildStreakWeekDays(null, 0, false, NOW)
    expect(days).toHaveLength(7)
    expect(days.map((day) => day.dateStr)).toEqual([
      '2026-06-06',
      '2026-06-07',
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ])
    expect(days[6]!.isToday).toBe(true)
  })

  it('marks the lastActiveDate day itself as active regardless of the current time of day', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-06-11', recentFreezeDates: [] },
      10,
      false,
      NOW,
    )
    expect(days[5]!.dateStr).toBe('2026-06-11')
    expect(days[5]!.status).toBe('active')
    expect(days[6]!.status).toBe('today')
    expect(days.slice(0, 5).every((day) => day.status === 'active')).toBe(true)
  })

  it('marks today as active once the streak reaches today', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-06-12', recentFreezeDates: [] },
      11,
      false,
      NOW,
    )
    expect(days[5]!.status).toBe('active')
    expect(days[6]!.status).toBe('active')
  })

  it('marks frozen days as frozen even inside the active range', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-06-12', recentFreezeDates: ['2026-06-11'] },
      12,
      false,
      NOW,
    )
    expect(days[5]!.status).toBe('frozen')
    expect(days[6]!.status).toBe('active')
  })

  it('marks today as frozen when a freeze is active today', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-06-10', recentFreezeDates: ['2026-06-12'] },
      9,
      true,
      NOW,
    )
    expect(days[6]!.status).toBe('frozen')
  })

  it('marks days after the streak ended as missed', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: '2026-06-09', recentFreezeDates: [] },
      3,
      false,
      NOW,
    )
    expect(days.map((day) => day.status)).toEqual([
      'missed',
      'active',
      'active',
      'active',
      'missed',
      'missed',
      'today',
    ])
  })

  it('marks everything before today as missed when there is no streak', () => {
    const days = buildStreakWeekDays(
      { lastActiveDate: null, recentFreezeDates: [] },
      0,
      false,
      NOW,
    )
    expect(days.slice(0, 6).every((day) => day.status === 'missed')).toBe(true)
    expect(days[6]!.status).toBe('today')
  })
})

describe('streak eligibility', () => {
  it('keeps days before the first eligible date neutral even inside active and frozen ranges', () => {
    const days = buildStreakWeekDays({ lastActiveDate: '2026-06-12', recentFreezeDates: ['2026-06-07', '2026-06-10'] }, 14, false, NOW, 7, undefined, '2026-06-09')
    expect(days.map(day => day.status)).toEqual(['not-scheduled', 'not-scheduled', 'not-scheduled', 'active', 'frozen', 'active', 'active'])
  })

  it.each([false, true])('keeps eligible missed days and today rules with frozen=%s', (frozen) => {
    const days = buildStreakWeekDays(null, 0, frozen, NOW, 7, undefined, '2026-06-10')
    expect(days.map(day => day.status)).toEqual(['not-scheduled', 'not-scheduled', 'not-scheduled', 'not-scheduled', 'missed', 'missed', frozen ? 'frozen' : 'today'])
  })

  it.each([null, undefined])('keeps the legacy strip without an eligible date (%s)', (firstEligibleDate) => {
    expect(buildStreakWeekDays(null, 0, false, NOW, 7, undefined, firstEligibleDate).map(day => day.status))
      .toEqual(['missed', 'missed', 'missed', 'missed', 'missed', 'missed', 'today'])
  })

  it('makes every day neutral when eligibility starts after the visible window', () => {
    expect(buildStreakWeekDays(null, 0, true, NOW, 14, undefined, '2026-06-13').map(day => day.status))
      .toEqual(Array(14).fill('not-scheduled'))
  })

  it('compares the first eligible date with account calendar dates across device midnight', () => {
    const days = buildStreakWeekDays(null, 0, false, new Date('2026-06-12T06:00:00Z'), 7, 'Pacific/Honolulu', '2026-06-11')
    expect(days.at(-1)).toMatchObject({ dateStr: '2026-06-11', status: 'today' })
    expect(days.slice(0, -1).map(day => day.status)).toEqual(Array(6).fill('not-scheduled'))
  })
})
