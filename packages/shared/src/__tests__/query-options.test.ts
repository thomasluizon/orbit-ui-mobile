import { describe, expect, it } from 'vitest'
import {
  HABITS_REFETCH_INTERVAL,
  NOTIFICATIONS_REFETCH_INTERVAL,
  QUERY_STALE_TIMES,
} from '../query'

describe('query options', () => {
  it('keeps active polling slower than query freshness', () => {
    expect(HABITS_REFETCH_INTERVAL).toBe(5 * 60 * 1000)
    expect(QUERY_STALE_TIMES.habits).toBe(30 * 1000)
    expect(NOTIFICATIONS_REFETCH_INTERVAL).toBe(5 * 60 * 1000)
    expect(QUERY_STALE_TIMES.notifications).toBe(60 * 1000)
  })
})
