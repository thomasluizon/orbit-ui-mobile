import { describe, expect, it } from 'vitest'
import {
  WIDGET_REFRESH_TIMEOUT_MS,
  shouldShowColdSkeleton,
} from '@/lib/widget-refresh-timeout'

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
