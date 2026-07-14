import { describe, expect, it } from 'vitest'
import {
  buildHabitQueryString,
  getMsUntilNextDailySummaryTimeBucket,
} from '../utils/habit-query'

describe('buildHabitQueryString extra filters', () => {
  it('serializes general, search and range filters', () => {
    const query = buildHabitQueryString({
      dateTo: '2026-04-30',
      isGeneral: true,
      includeGeneral: true,
      search: 'focus',
    })

    expect(query).toBe('dateTo=2026-04-30&isGeneral=true&includeGeneral=true&search=focus')
  })
})

describe('getMsUntilNextDailySummaryTimeBucket boundaries', () => {
  it('targets the next bucket boundary for each period of the day', () => {
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T09:00:00'))).toBe(2 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T13:00:00'))).toBe(4 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T19:00:00'))).toBe(2 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T23:00:00'))).toBe(1 * 60 * 60_000)
  })
})
