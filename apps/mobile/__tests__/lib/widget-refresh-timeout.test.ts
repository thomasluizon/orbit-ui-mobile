import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  WIDGET_REFRESH_TIMEOUT_MS,
  shouldShowColdSkeleton,
} from '@/lib/widget-refresh-timeout'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

describe('shouldShowColdSkeleton', () => {
  it('keeps the skeleton up when signed in and never synced', () => {
    expect(shouldShowColdSkeleton(0, false)).toBe(true)
  })

  it('hides the skeleton once the cache has synced', () => {
    expect(shouldShowColdSkeleton(Date.now(), false)).toBe(false)
  })

  it('hides the skeleton when signed out so the empty state shows instead', () => {
    expect(shouldShowColdSkeleton(0, true)).toBe(false)
  })
})

describe('WIDGET_REFRESH_TIMEOUT_MS', () => {
  it('outlasts the native fetch budget so a slow success is not pre-empted', () => {
    expect(WIDGET_REFRESH_TIMEOUT_MS).toBeGreaterThan(10_000)
  })
})
