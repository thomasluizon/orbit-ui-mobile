import { describe, expect, it } from 'vitest'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  getDailySummaryTimeBucket,
  getMsUntilNextDailySummaryTimeBucket,
} from '../utils/habit-query'

describe('buildHabitQueryString', () => {
  it('builds repeated tag ids and scalar filters for the habits API', () => {
    const query = buildHabitQueryString({
      dateFrom: '2025-04-01',
      includeOverdue: true,
      isCompleted: false,
      frequencyUnit: 'Week',
      tagIds: ['tag-1', 'tag-2'],
      page: 2,
      pageSize: 50,
    })

    expect(query).toBe(
      'dateFrom=2025-04-01&includeOverdue=true&isCompleted=false&frequencyUnit=Week&tagIds=tag-1&tagIds=tag-2&page=2&pageSize=50',
    )
  })
})

describe('buildUrlWithQuery', () => {
  it('appends a query string when present', () => {
    expect(buildUrlWithQuery('/api/habits', 'page=2')).toBe('/api/habits?page=2')
  })

  it('returns the base url when the query string is empty', () => {
    expect(buildUrlWithQuery('/api/habits', '')).toBe('/api/habits')
  })
})

describe('daily summary time buckets', () => {
  it('classifies day periods by local hour', () => {
    expect(getDailySummaryTimeBucket(new Date('2025-04-01T07:00:00'))).toBe('morning')
    expect(getDailySummaryTimeBucket(new Date('2025-04-01T13:00:00'))).toBe('afternoon')
    expect(getDailySummaryTimeBucket(new Date('2025-04-01T19:00:00'))).toBe('evening')
    expect(getDailySummaryTimeBucket(new Date('2025-04-01T22:00:00'))).toBe('night')
  })

  it('returns the next bucket boundary delay', () => {
    expect(getMsUntilNextDailySummaryTimeBucket(new Date('2025-04-01T10:59:00'))).toBe(60_000)
  })
})
