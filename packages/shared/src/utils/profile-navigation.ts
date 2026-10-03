import { formatLocaleDate } from './locale-format'
import type { Profile } from '../types/profile'
import {
  canAccessEntitlement,
  type UpgradeEntitlementMode,
  type UpgradeEntitlementRequirement,
} from './upgrade'

export type ProfileNavSection = 'account' | 'features'

export type ProfileSettingsGroupId = 'you' | 'more' | 'ending'

export interface ProfileSettingsGroupDefinition {
  id: ProfileSettingsGroupId
  labelKey: string | null
}

export const PROFILE_SETTINGS_GROUPS: readonly ProfileSettingsGroupDefinition[] = [
  { id: 'you', labelKey: null },
  { id: 'more', labelKey: 'profile.groups.more' },
  { id: 'ending', labelKey: null },
]

export const PROFILE_SUBMENUS = [
  { id: 'account', iconKey: 'account', route: '/profile/account', labelKey: 'profile.submenus.account' },
  { id: 'preferences', iconKey: 'preferences', route: '/profile/preferences', labelKey: 'profile.submenus.preferences' },
  { id: 'astra', iconKey: 'astra', route: '/profile/astra', labelKey: 'profile.groups.astra' },
  { id: 'notifications', iconKey: 'notifications', route: '/profile/notifications', labelKey: 'profile.groups.notifications' },
] as const

export type ProfileSubmenuId = typeof PROFILE_SUBMENUS[number]['id']

export function getProfileProEntry(
  profile: Profile,
  t: (key: string, values?: Record<string, string>) => string,
): { value: string; href: '/upgrade' | undefined } {
  if (profile.isLifetimePro) {
    return { value: t('upgrade.billing.plan.lifetimeBadge'), href: undefined }
  }
  if (profile.isTrialActive) {
    const value = t('upgrade.billing.plan.trialBadge')
    return { value, href: '/upgrade' }
  }
  return {
    value: t(profile.hasProAccess ? 'profile.subscription.active' : 'profile.allowance.free'),
    href: '/upgrade',
  }
}

export function getProfileTrialEndHint(
  profile: Pick<Profile, 'isTrialActive' | 'trialEndsAt'> | null | undefined,
  locale: string,
  t: (key: string, values?: Record<string, string>) => string,
): string | undefined {
  if (!profile?.isTrialActive || !profile.trialEndsAt) return undefined
  return t('upgrade.billing.plan.trialHint', {
    date: formatLocaleDate(profile.trialEndsAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
  })
}

export type ProfileNavVariant = 'default' | 'primary'

export type ProfileNavIconKey =
  | 'account'
  | 'pro'
  | 'preferences'
  | 'astra'
  | 'notifications'
  | 'wrapped'
  | 'widget'
  | 'calendar'
  | 'support'
  | 'info'

export type ProfileNavHintMode = 'static' | 'gamificationProfile'

interface ProfileNavItemBase {
  id: string
  section: ProfileNavSection
  iconKey: ProfileNavIconKey
  titleKey: string
  hintKey: string | null
  variant: ProfileNavVariant
  proBadge: boolean
  hintMode: ProfileNavHintMode
  entitlementRequirement: UpgradeEntitlementRequirement | null
  entitlementMode: UpgradeEntitlementMode | null
}

export type ProfileNavItem = ProfileNavItemBase & (
  | { route: string; action?: never }
  | { route: null; action: 'openWidget' }
)

export const PROFILE_NAV_ITEMS: ProfileNavItem[] = [
  {
    id: 'wrapped',
    section: 'features',
    route: '/wrapped',
    iconKey: 'wrapped',
    titleKey: 'profile.settingsRows.wrapped',
    hintKey: null,
    variant: 'primary',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'android-widget',
    section: 'features',
    route: null,
    action: 'openWidget',
    iconKey: 'widget',
    titleKey: 'profile.widgetTitle',
    hintKey: null,
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'calendar-sync',
    section: 'features',
    route: '/calendar',
    iconKey: 'calendar',
    titleKey: 'profile.calendarSync.title',
    hintKey: null,
    variant: 'primary',
    proBadge: true,
    hintMode: 'static',
    entitlementRequirement: 'pro',
    entitlementMode: 'redirect',
  },
  {
    id: 'support',
    section: 'features',
    route: '/support',
    iconKey: 'support',
    titleKey: 'profile.support.rowTitle',
    hintKey: null,
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'about',
    section: 'features',
    route: '/about',
    iconKey: 'info',
    titleKey: 'profile.aboutRow',
    hintKey: null,
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
]

export function shouldRedirectProfileNavItem(
  item: Pick<ProfileNavItem, 'entitlementMode' | 'entitlementRequirement'>,
  profile: Pick<Profile, 'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'> | null | undefined,
): boolean {
  if (item.entitlementMode !== 'redirect') {
    return false
  }

  return !canAccessEntitlement(profile, item.entitlementRequirement)
}
