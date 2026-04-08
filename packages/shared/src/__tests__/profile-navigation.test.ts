import { describe, expect, it } from 'vitest'
import { PROFILE_NAV_ITEMS } from '../utils/profile-navigation'

describe('profile-navigation', () => {
  it('keeps the web-aligned profile card order and routes', () => {
    expect(PROFILE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'preferences',
      'ai-settings',
      'retrospective',
      'achievements',
      'calendar-sync',
      'about',
      'advanced',
    ])

    expect(PROFILE_NAV_ITEMS.map((item) => item.route)).toEqual([
      '/preferences',
      '/ai-settings',
      '/retrospective',
      '/achievements',
      '/calendar-sync',
      '/about',
      '/advanced',
    ])
  })

  it('keeps achievements title aligned with web source-of-truth key', () => {
    const achievements = PROFILE_NAV_ITEMS.find((item) => item.id === 'achievements')
    expect(achievements?.titleKey).toBe('gamification.profileCard.title')
    expect(achievements?.hintMode).toBe('gamificationProfile')
    expect(achievements?.proBadge).toBe(true)
    expect(achievements?.variant).toBe('primary')
  })

  it('splits nav items between account and feature sections', () => {
    const account = PROFILE_NAV_ITEMS.filter((item) => item.section === 'account')
    const features = PROFILE_NAV_ITEMS.filter((item) => item.section === 'features')
    expect(account).toHaveLength(2)
    expect(features).toHaveLength(5)
  })
})
