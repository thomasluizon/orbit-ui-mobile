import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { format, startOfDay, subDays } from 'date-fns'
import { buildStreakWeekDays } from '../utils/streak-week'

const PROPERTY_PARAMS = { seed: 424242, numRuns: 100 } as const
const NOW = new Date(2026, 5, 12, 11, 29, 0)
const TODAY = startOfDay(NOW)

describe('buildStreakWeekDays (properties)', () => {
  test.prop(
    {
      currentStreak: fc.integer({ min: 1, max: 14 }),
      offset: fc.integer({ min: 0, max: 6 }),
    },
    PROPERTY_PARAMS,
  )('active days form one contiguous run ending at the last active day', ({ currentStreak, offset }) => {
    const lastActiveDate = format(subDays(TODAY, offset), 'yyyy-MM-dd')
    const days = buildStreakWeekDays(
      { lastActiveDate, recentFreezeDates: [] },
      currentStreak,
      false,
      NOW,
    )

    const activeIndices = days
      .map((day, index) => ({ index, status: day.status }))
      .filter((entry) => entry.status === 'active')
      .map((entry) => entry.index)

    expect(activeIndices.length).toBeGreaterThan(0)

    const earliest = Math.min(...activeIndices)
    const latest = Math.max(...activeIndices)
    expect(latest - earliest + 1).toBe(activeIndices.length)

    const lastActiveIndex = 6 - offset
    const streakStartIndex = lastActiveIndex - (currentStreak - 1)
    for (const index of activeIndices) {
      expect(index).toBeLessThanOrEqual(lastActiveIndex)
      expect(index).toBeGreaterThanOrEqual(streakStartIndex)
    }
  })
})
