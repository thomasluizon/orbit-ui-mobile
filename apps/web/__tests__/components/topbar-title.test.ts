import { describe, expect, it } from 'vitest'
import { resolveTopbarTitleKey } from '@/components/shell/topbar-title'

describe('resolveTopbarTitleKey', () => {
  it('returns null on the home view', () => {
    expect(resolveTopbarTitleKey('/', true)).toBeNull()
    expect(resolveTopbarTitleKey('/calendar', true)).toBeNull()
  })

  it('maps mapped routes to their i18n key', () => {
    expect(resolveTopbarTitleKey('/insights', false)).toBe('nav.insights')
    expect(resolveTopbarTitleKey('/profile/settings', false)).toBe('nav.profile')
    expect(resolveTopbarTitleKey('/upgrade', false)).toBe('upgrade.title')
  })

  it('prefers the more specific prefix when routes overlap', () => {
    expect(resolveTopbarTitleKey('/calendar-sync', false)).toBe('calendar.title')
    expect(resolveTopbarTitleKey('/calendar', false)).toBe('nav.calendar')
    expect(resolveTopbarTitleKey('/social/challenges/abc', false)).toBe(
      'challenges.title',
    )
    expect(resolveTopbarTitleKey('/social', false)).toBe('social.title')
  })

  it('returns null for unmapped routes', () => {
    expect(resolveTopbarTitleKey('/unknown-route', false)).toBeNull()
  })
})
