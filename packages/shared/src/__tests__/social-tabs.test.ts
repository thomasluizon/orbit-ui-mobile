import { describe, expect, it } from 'vitest'
import { resolveSocialTab } from '../utils'

describe('resolveSocialTab', () => {
  it('keeps a live tab exactly as given', () => {
    expect(resolveSocialTab('feed')).toBe('feed')
    expect(resolveSocialTab('friends')).toBe('friends')
  })

  it('falls back to the feed for a missing or unrecognized tab', () => {
    expect(resolveSocialTab(undefined)).toBe('feed')
    expect(resolveSocialTab(null)).toBe('feed')
    expect(resolveSocialTab('')).toBe('feed')
    expect(resolveSocialTab('not-a-tab')).toBe('feed')
  })

  /**
   * Codex connector P2 on #698. Accountability buddies are deleted, but `/social?tab=buddies` is the
   * URL of push notifications queued before the deletion and of inbox rows already persisted, and
   * the notification detail modals still offer View on them. Falling through to the default landed
   * those taps on the unrelated Feed tab, which reads as a bug rather than a retired feature.
   */
  it('redirects the retired buddies destination to the surviving relationship surface', () => {
    expect(resolveSocialTab('buddies')).toBe('friends')
  })

  it('does not treat the retired destination as the default, which would hide the redirect', () => {
    expect(resolveSocialTab('buddies')).not.toBe(resolveSocialTab('not-a-tab'))
  })
})
