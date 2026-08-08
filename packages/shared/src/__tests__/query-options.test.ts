import { describe, expect, it } from 'vitest'
import * as queryOptions from '../query'

describe('query options', () => {
  it('does not expose a periodic habit-list poll while notifications remain bounded', () => {
    expect('HABITS_REFETCH_INTERVAL' in queryOptions).toBe(false)
    expect(queryOptions.QUERY_STALE_TIMES.habits).toBe(30 * 1000)
    expect(queryOptions.NOTIFICATIONS_REFETCH_INTERVAL).toBe(5 * 60 * 1000)
    expect(queryOptions.QUERY_STALE_TIMES.notifications).toBe(60 * 1000)
    expect(queryOptions.QUERY_STALE_TIMES.accountability).toBe(30 * 1000)
  })
})
