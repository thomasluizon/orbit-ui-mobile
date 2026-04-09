import { describe, expect, it } from 'vitest'
import { HABITS_REFETCH_INTERVAL, QUERY_STALE_TIMES } from '../query'

describe('query options', () => {
  it('exposes a 30s habits refetch interval matching the habits staleTime', () => {
    expect(HABITS_REFETCH_INTERVAL).toBe(30_000)
    expect(HABITS_REFETCH_INTERVAL).toBe(QUERY_STALE_TIMES.habits)
  })
})
