import type { Profile } from '../types/profile'
import {
  canAccessEntitlement,
  type UpgradeEntitlementMode,
  type UpgradeEntitlementRequirement,
} from './upgrade'

export type ProfileNavSection = 'account' | 'features'

export type ProfileSettingsGroupId =
  | 'you'
  | 'astra'
  | 'notifications'
  | 'more'
  | 'ending'

export interface ProfileSettingsGroupDefinition {
  id: ProfileSettingsGroupId
  labelKey: string
}

export const PROFILE_SETTINGS_GROUPS: readonly ProfileSettingsGroupDefinition[] = [
  { id: 'you', labelKey: 'profile.groups.you' },
  { id: 'astra', labelKey: 'profile.groups.astra' },
  { id: 'notifications', labelKey: 'profile.groups.notifications' },
  { id: 'more', labelKey: 'profile.groups.more' },
  { id: 'ending', labelKey: 'profile.groups.ending' },
]

export type ProfileNavVariant = 'default' | 'primary'

export type ProfileNavIconKey =
  | 'wrapped'
  | 'widget'
  | 'calendar'
  | 'support'
  | 'info'

export type ProfileNavDestination =
  | { type: 'route'; route: string }
  | { type: 'conversation' }

export type ProfileNavHintMode = 'static' | 'gamificationProfile'

export interface ProfileNavItem {
  id: string
  section: ProfileNavSection
  destination: ProfileNavDestination
  iconKey: ProfileNavIconKey
  titleKey: string
  hintKey: string | null
  variant: ProfileNavVariant
  proBadge: boolean
  hintMode: ProfileNavHintMode
  entitlementRequirement: UpgradeEntitlementRequirement | null
  entitlementMode: UpgradeEntitlementMode | null
}

export const PROFILE_NAV_ITEMS: ProfileNavItem[] = [
  {
    id: 'wrapped',
    section: 'features',
    destination: { type: 'route', route: '/wrapped' },
    iconKey: 'wrapped',
    titleKey: 'profile.wrappedTitle',
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
    destination: { type: 'route', route: '/advanced' },
    iconKey: 'widget',
    titleKey: 'profile.widgetTitle',
    hintKey: 'profile.widgetHint',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'calendar-sync',
    section: 'features',
    destination: { type: 'route', route: '/calendar-sync' },
    iconKey: 'calendar',
    titleKey: 'calendar.profileButton',
    hintKey: 'calendar.profileHint',
    variant: 'primary',
    proBadge: true,
    hintMode: 'static',
    entitlementRequirement: 'pro',
    entitlementMode: 'redirect',
  },
  {
    id: 'support',
    section: 'features',
    destination: { type: 'conversation' },
    iconKey: 'support',
    titleKey: 'profile.support.title',
    hintKey: 'profile.support.description',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'about',
    section: 'features',
    destination: { type: 'route', route: '/about' },
    iconKey: 'info',
    titleKey: 'profile.sections.aboutHelp',
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
