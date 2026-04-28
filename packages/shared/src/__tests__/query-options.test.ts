import { describe, expect, it } from 'vitest'
import {
  HABITS_REFETCH_INTERVAL,
  NOTIFICATIONS_REFETCH_INTERVAL,
  QUERY_STALE_TIMES,
} from '../query'

describe('query options', () => {
  it('exposes 5 minute refetch intervals matching stale times', () => {
    expect(HABITS_REFETCH_INTERVAL).toBe(5 * 60 * 1000)
    expect(HABITS_REFETCH_INTERVAL).toBe(QUERY_STALE_TIMES.habits)
    expect(NOTIFICATIONS_REFETCH_INTERVAL).toBe(5 * 60 * 1000)
    expect(NOTIFICATIONS_REFETCH_INTERVAL).toBe(QUERY_STALE_TIMES.notifications)
  })
})
