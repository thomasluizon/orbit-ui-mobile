import { describe, expect, it } from 'vitest'
import {
  buildHabitQueryString,
  getDailySummaryTimeBucket,
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
  it.each([
    ['2026-08-29T13:59:00Z', 'America/Sao_Paulo', 'morning', 60_000],
    ['2026-08-29T19:59:00Z', 'America/Sao_Paulo', 'afternoon', 60_000],
    ['2026-08-29T23:59:00Z', 'America/Sao_Paulo', 'evening', 60_000],
    ['2026-08-30T02:59:00Z', 'America/Sao_Paulo', 'night', 60_000],
    ['2026-08-29T05:14:00Z', 'Asia/Kathmandu', 'morning', 60_000],
    ['2026-03-08T05:00:00Z', 'America/New_York', 'morning', 10 * 60 * 60_000],
    ['2026-11-01T04:00:00Z', 'America/New_York', 'morning', 12 * 60 * 60_000],
    ['2026-08-29T10:59:00Z', null, 'morning', 60_000],
    ['2026-08-29T10:59:00Z', 'Invalid/Zone', 'morning', 60_000],
  ])('uses the account boundary at %s in %s', (instant, timeZone, bucket, delay) => {
    const date = new Date(instant)
    expect(getDailySummaryTimeBucket(date, timeZone)).toBe(bucket)
    expect(getMsUntilNextDailySummaryTimeBucket(date, timeZone)).toBe(delay)
    expect(getDailySummaryTimeBucket(new Date(date.getTime() + delay), timeZone)).not.toBe(bucket)
  })

  it('keeps the exact boundary with nonzero seconds and milliseconds', () => {
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-08-29T13:57:30.250Z'), 'America/Sao_Paulo')).toBe(149_750)
  })

  it('targets the next bucket boundary for each period of the day', () => {
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T09:00:00Z'))).toBe(2 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T13:00:00Z'))).toBe(4 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T19:00:00Z'))).toBe(2 * 60 * 60_000)
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2026-04-06T23:00:00Z'))).toBe(1 * 60 * 60_000)
  })
})
