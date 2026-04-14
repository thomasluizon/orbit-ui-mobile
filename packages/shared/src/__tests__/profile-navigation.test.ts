import { describe, expect, it } from 'vitest'
import {
  PROFILE_NAV_ITEMS,
  isProfileNavItemLocked,
  shouldRedirectProfileNavItem,
} from '../utils/profile-navigation'

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
    expect(achievements?.entitlementRequirement).toBe('pro')
    expect(achievements?.entitlementMode).toBe('redirect')
  })

  it('splits nav items between account and feature sections', () => {
    const account = PROFILE_NAV_ITEMS.filter((item) => item.section === 'account')
    const features = PROFILE_NAV_ITEMS.filter((item) => item.section === 'features')
    expect(account).toHaveLength(2)
    expect(features).toHaveLength(5)
  })

  it('marks locked destinations and mixed screens explicitly', () => {
    const calendar = PROFILE_NAV_ITEMS.find((item) => item.id === 'calendar-sync')
    const retrospective = PROFILE_NAV_ITEMS.find((item) => item.id === 'retrospective')
    const preferences = PROFILE_NAV_ITEMS.find((item) => item.id === 'preferences')

    expect(calendar?.proBadge).toBe(true)
    expect(calendar?.entitlementRequirement).toBe('pro')
    expect(retrospective?.entitlementRequirement).toBe('yearlyPro')
    expect(preferences?.entitlementMode).toBe('mixed')
  })

  it('uses the shared entitlement rules for redirect decisions', () => {
    const achievements = PROFILE_NAV_ITEMS.find((item) => item.id === 'achievements')
    const retrospective = PROFILE_NAV_ITEMS.find((item) => item.id === 'retrospective')
    const advanced = PROFILE_NAV_ITEMS.find((item) => item.id === 'advanced')

    expect(
      shouldRedirectProfileNavItem(achievements!, {
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: null,
      }),
    ).toBe(true)

    expect(
      isProfileNavItemLocked(retrospective!, {
        hasProAccess: true,
        isLifetimePro: false,
        subscriptionInterval: 'monthly',
      }),
    ).toBe(true)

    expect(
      shouldRedirectProfileNavItem(advanced!, {
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: null,
      }),
    ).toBe(false)
  })
})
