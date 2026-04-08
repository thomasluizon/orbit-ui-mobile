import { describe, expect, it } from 'vitest'
import {
  buildRetrospectiveRequestUrl,
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
})
