import { describe, expect, it } from 'vitest'
import {
  PROFILE_NAV_ITEMS,
  PROFILE_SETTINGS_GROUPS,
  buildProfileNavSections,
  isProfileNavItemLocked,
  resolveProfileNavHint,
  shouldRedirectProfileNavItem,
} from '../utils/profile-navigation'

const translate = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key

describe('profile-navigation', () => {
  it('defines the five profile groups in display order', () => {
    expect(PROFILE_SETTINGS_GROUPS).toEqual([
      { id: 'you', labelKey: 'profile.groups.you' },
      { id: 'astra', labelKey: 'profile.groups.astra' },
      { id: 'notifications', labelKey: 'profile.groups.notifications' },
      { id: 'more', labelKey: 'profile.groups.more' },
      { id: 'ending', labelKey: 'profile.groups.ending' },
    ])
  })

  it('keeps only the outbound rows that remain in the profile frame', () => {
    expect(PROFILE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'wrapped',
      'calendar-sync',
      'about',
    ])

    expect(PROFILE_NAV_ITEMS.map((item) => item.route)).toEqual([
      '/wrapped',
      '/calendar-sync',
      '/about',
    ])
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

  it('splits nav items between account and feature sections', () => {
    const account = PROFILE_NAV_ITEMS.filter((item) => item.section === 'account')
    const features = PROFILE_NAV_ITEMS.filter((item) => item.section === 'features')
    expect(account).toHaveLength(0)
    expect(features).toHaveLength(3)
  })

  it('marks locked destinations and mixed screens explicitly', () => {
    const calendar = PROFILE_NAV_ITEMS.find((item) => item.id === 'calendar-sync')
    const about = PROFILE_NAV_ITEMS.find((item) => item.id === 'about')

    expect(calendar?.proBadge).toBe(true)
    expect(calendar?.entitlementRequirement).toBe('pro')
    expect(about?.entitlementMode).toBeNull()
  })

  it('expands section definitions into groups selecting matching nav items in id order', () => {
    const sections = buildProfileNavSections([
      { labelKey: 'explore.sections.progress', ids: ['wrapped'] },
      { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
    ])

    expect(sections).toHaveLength(2)
    expect(sections[0]?.labelKey).toBe('explore.sections.progress')
    expect(sections[0]?.items.map((item) => item.id)).toEqual(['wrapped'])
    expect(sections[1]?.items.map((item) => item.id)).toEqual(['about'])
  })

  it('yields an empty item list for a section whose ids match nothing', () => {
    const [section] = buildProfileNavSections([{ labelKey: 'missing.section', ids: ['missing'] }])
    expect(section?.items).toEqual([])
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
    const calendar = PROFILE_NAV_ITEMS.find((item) => item.id === 'calendar-sync')
    const about = PROFILE_NAV_ITEMS.find((item) => item.id === 'about')

    expect(
      shouldRedirectProfileNavItem(calendar!, {
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: null,
      }),
    ).toBe(true)

    expect(
      isProfileNavItemLocked(calendar!, {
        hasProAccess: true,
        isLifetimePro: false,
        subscriptionInterval: 'monthly',
      }),
    ).toBe(false)

    expect(
      shouldRedirectProfileNavItem(about!, {
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: null,
      }),
    ).toBe(false)
  })
})
