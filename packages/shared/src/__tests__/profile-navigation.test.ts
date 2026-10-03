import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  PROFILE_NAV_ITEMS,
  PROFILE_SETTINGS_GROUPS,
  PROFILE_SUBMENUS,
  getProfileProEntry,
  shouldRedirectProfileNavItem,
} from '../utils/profile-navigation'
import { createMockProfile } from './factories'

describe('profile-navigation', () => {
  it('keeps navigation before More of Orbit and sign out', () => {
    expect(PROFILE_SETTINGS_GROUPS).toEqual([
      { id: 'you', labelKey: null },
      { id: 'more', labelKey: 'profile.groups.more' },
      { id: 'ending', labelKey: null },
    ])
    expect(PROFILE_SUBMENUS.map((submenu) => 'iconKey' in submenu ? submenu.iconKey : undefined)).toEqual(['account', 'preferences', 'astra', 'notifications'])
    expect(PROFILE_SUBMENUS.map(({ route }) => route)).toEqual([
      '/profile/account', '/profile/preferences', '/profile/astra', '/profile/notifications',
    ])
  })

  it('keeps the profile rows and their destinations in display order', () => {
    expect(PROFILE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'wrapped',
      'android-widget',
      'calendar-sync',
      'support',
      'about',
    ])

    expect(PROFILE_NAV_ITEMS.map((item) => item.route)).toEqual([
      '/wrapped',
      null,
      '/calendar?import=1',
      '/support',
      '/about',
    ])
    expect(PROFILE_NAV_ITEMS.find((item) => item.id === 'android-widget')?.action).toBe('openWidget')
    expect(PROFILE_NAV_ITEMS.map(({ titleKey, hintKey }) => [titleKey, hintKey])).toEqual([
      ['profile.settingsRows.wrapped', null],
      ['profile.widgetTitle', null],
      ['profile.calendarSync.title', null],
      ['profile.support.rowTitle', null],
      ['profile.aboutRow', null],
    ])
  })

  it('keeps Wrapped copy scoped to Perfil without changing Progress or notifications', () => {
    expect(en.profile.settingsRows.wrapped).toBe('Orbit Wrapped')
    expect(ptBR.profile.settingsRows.wrapped).toBe('Orbit Wrapped')
    expect(en.profile.wrappedTitle).toBe('Your Wrapped')
    expect(ptBR.profile.wrappedTitle).toBe('Seu Wrapped')
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
    expect(features).toHaveLength(5)
  })

  it('marks locked destinations and mixed screens explicitly', () => {
    const calendar = PROFILE_NAV_ITEMS.find((item) => item.id === 'calendar-sync')
    const about = PROFILE_NAV_ITEMS.find((item) => item.id === 'about')

    expect(calendar?.proBadge).toBe(true)
    expect(calendar?.entitlementRequirement).toBe('pro')
    expect(about?.entitlementMode).toBeNull()
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
      shouldRedirectProfileNavItem(about!, {
        hasProAccess: false,
        isLifetimePro: false,
        subscriptionInterval: null,
      }),
    ).toBe(false)
  })

  describe.each([
    ['en', en],
    ['pt-BR', ptBR],
  ] as const)('the Orbit Pro entry in %s', (locale, messages) => {
    const translate = (key: string, values?: Record<string, string>) => {
      const message = key.split('.').reduce<unknown>(
        (node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined),
        messages,
      )
      if (typeof message !== 'string') throw new Error(`missing ${key}`)
      return message.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? '')
    }
    const expected = locale === 'en'
      ? { free: 'Free', pro: 'Active', lifetime: 'Lifetime', trial: 'Trial' }
      : { free: 'Grátis', pro: 'Ativo', lifetime: 'Vitalício', trial: 'Teste' }

    it('opens the pitch for a free account', () => {
      const profile = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false, isLifetimePro: false })
      expect(getProfileProEntry(profile, translate)).toEqual({ value: expected.free, href: '/upgrade' })
    })

    it('keeps the trial end date off Perfil and opens the pitch for a trial account', () => {
      const profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, isLifetimePro: false, trialEndsAt: '2099-10-09T12:00:00Z' })
      expect(getProfileProEntry(profile, translate)).toEqual({ value: expected.trial, href: '/upgrade' })
    })

    it('keeps the plain trial label when the trial has no end date', () => {
      const profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, isLifetimePro: false, trialEndsAt: null })
      expect(getProfileProEntry(profile, translate)).toEqual({ value: expected.trial, href: '/upgrade' })
    })

    it('opens the subscription for a paid Pro account', () => {
      const profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false, isLifetimePro: false })
      expect(getProfileProEntry(profile, translate)).toEqual({ value: expected.pro, href: '/upgrade' })
    })

    it('shows lifetime Pro read-only', () => {
      const profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: false, isLifetimePro: true })
      expect(getProfileProEntry(profile, translate)).toEqual({ value: expected.lifetime, href: undefined })
    })
  })
})
