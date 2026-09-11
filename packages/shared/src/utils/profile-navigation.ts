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
  | 'settings'
  | 'orbit'
  | 'wrapped'
  | 'calendar'
  | 'info'
  | 'wrench'
  | 'compass'

export type ProfileNavHintMode = 'static' | 'gamificationProfile'

export interface ProfileNavItem {
  id: string
  section: ProfileNavSection
  route: string
  iconKey: ProfileNavIconKey
  titleKey: string
  hintKey: string
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
    route: '/wrapped',
    iconKey: 'wrapped',
    titleKey: 'profile.wrappedTitle',
    hintKey: 'profile.wrappedHint',
    variant: 'primary',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: null,
  },
  {
    id: 'calendar-sync',
    section: 'features',
    route: '/calendar-sync',
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
    id: 'about',
    section: 'features',
    route: '/about',
    iconKey: 'info',
    titleKey: 'profile.sections.aboutHelp',
    hintKey: 'profile.sections.aboutHelpHint',
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
