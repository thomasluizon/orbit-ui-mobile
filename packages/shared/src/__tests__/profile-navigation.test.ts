import { describe, expect, it } from 'vitest'
import {
  PROFILE_NAV_ITEMS,
  buildProfileNavSections,
  isProfileNavItemLocked,
  resolveProfileNavHint,
  shouldRedirectProfileNavItem,
} from '../utils/profile-navigation'

const translate = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key

describe('profile-navigation', () => {
  it('keeps the web-aligned profile card order and routes', () => {
    expect(PROFILE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'preferences',
      'ai-settings',
      'public-profile',
      'social',
      'retrospective',
      'wrapped',
      'achievements',
      'calendar-sync',
      'about',
      'advanced',
    ])

    expect(PROFILE_NAV_ITEMS.map((item) => item.route)).toEqual([
      '/preferences',
      '/ai-settings',
      '/public-profile',
      '/social',
      '/retrospective',
      '/wrapped',
      '/achievements',
      '/calendar-sync',
      '/about',
      '/advanced',
    ])
  })

  it('exposes an ungated social entry on the features section', () => {
    const social = PROFILE_NAV_ITEMS.find((item) => item.id === 'social')
    expect(social?.route).toBe('/social')
    expect(social?.section).toBe('features')
    expect(social?.iconKey).toBe('friends')
    expect(social?.titleKey).toBe('social.profileNav.title')
    expect(social?.proBadge).toBe(false)
    expect(social?.entitlementRequirement).toBeNull()
    expect(social?.entitlementMode).toBeNull()
  })

  it('exposes Wrapped as a free, ungated feature entry', () => {
    const wrapped = PROFILE_NAV_ITEMS.find((item) => item.id === 'wrapped')
    expect(wrapped?.section).toBe('features')
    expect(wrapped?.route).toBe('/wrapped')
    expect(wrapped?.iconKey).toBe('wrapped')
    expect(wrapped?.proBadge).toBe(false)
    expect(wrapped?.entitlementRequirement).toBeNull()
    expect(wrapped?.entitlementMode).toBeNull()
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
    expect(account).toHaveLength(3)
    expect(features).toHaveLength(7)
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

  it('expands section definitions into groups selecting matching nav items in id order', () => {
    const sections = buildProfileNavSections([
      { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped'] },
      { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
    ])

    expect(sections).toHaveLength(2)
    expect(sections[0].labelKey).toBe('explore.sections.progress')
    expect(sections[0].items.map((item) => item.id)).toEqual(['retrospective', 'wrapped'])
    expect(sections[1].items.map((item) => item.id)).toEqual(['about', 'advanced'])
  })

  it('yields an empty item list for a section whose ids match nothing', () => {
    const [section] = buildProfileNavSections([{ labelKey: 'nav.social', ids: ['missing'] }])
    expect(section.items).toEqual([])
  })

  it('builds the gamification hint for pro users with a loaded profile', () => {
    expect(
      resolveProfileNavHint(
        { hintMode: 'gamificationProfile', hintKey: 'gamification.profileCard.hint' },
        { hasProAccess: true, gamificationProfile: { level: 4, totalXp: 870 } },
        translate,
      ),
    ).toBe(
      'gamification.profileCard.level:{"level":4} · gamification.profileCard.totalXp:{"total":870}',
    )
  })

  it('falls back to the static hint without pro access or gamification data', () => {
    expect(
      resolveProfileNavHint(
        { hintMode: 'gamificationProfile', hintKey: 'gamification.profileCard.hint' },
        { hasProAccess: false, gamificationProfile: { level: 4, totalXp: 870 } },
        translate,
      ),
    ).toBe('gamification.profileCard.hint')

    expect(
      resolveProfileNavHint(
        { hintMode: 'gamificationProfile', hintKey: 'gamification.profileCard.hint' },
        { hasProAccess: true, gamificationProfile: null },
        translate,
      ),
    ).toBe('gamification.profileCard.hint')

    expect(
      resolveProfileNavHint(
        { hintMode: 'static', hintKey: 'profile.sections.preferencesHint' },
        { hasProAccess: true, gamificationProfile: { level: 4, totalXp: 870 } },
        translate,
      ),
    ).toBe('profile.sections.preferencesHint')
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
