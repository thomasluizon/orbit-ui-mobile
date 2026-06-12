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
