import { describe, expect, it } from 'vitest'
import {
  buildRetrospectiveRequestUrl,
  getBestRetrospectiveWeekdayKey,
  getRetrospectiveCacheKey,
  RETROSPECTIVE_CACHE_PREFIX,
  RETROSPECTIVE_PERIODS,
} from '../utils/retrospective'

describe('retrospective utils', () => {
  it('exposes the supported retrospective periods', () => {
    expect(RETROSPECTIVE_PERIODS).toEqual([
      'week',
      'month',
      'quarter',
      'semester',
      'year',
    ])
  })

  it('builds the retrospective request url with encoded params', () => {
    expect(buildRetrospectiveRequestUrl('semester', 'pt-BR')).toBe(
      '/api/habits/retrospective?period=semester&language=pt-BR',
    )
  })

  it('builds the cache key from the shared prefix', () => {
    expect(getRetrospectiveCacheKey('year')).toBe(
      `${RETROSPECTIVE_CACHE_PREFIX}year`,
    )
  })

  it('reads the producer\'s Monday-first weekly consistency values', () => {
    expect(getBestRetrospectiveWeekdayKey([10, 20, 30, 80, 50, 60, 70])).toBe('thursday')
    expect(getBestRetrospectiveWeekdayKey([90, 90, 20, 10, 0, 0, 0])).toBe('monday')
    expect(getBestRetrospectiveWeekdayKey([])).toBeNull()
    expect(getBestRetrospectiveWeekdayKey([0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
})
