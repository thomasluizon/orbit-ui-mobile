import type { Profile } from '../types/profile'
import {
  canAccessEntitlement,
  type UpgradeEntitlementMode,
  type UpgradeEntitlementRequirement,
} from './upgrade'

export type ProfileNavSection = 'account' | 'features'

export type ProfileNavVariant = 'default' | 'primary'

export type ProfileNavIconKey =
  | 'settings'
  | 'sparkles'
  | 'retrospective'
  | 'achievements'
  | 'calendar'
  | 'info'
  | 'wrench'

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
    id: 'preferences',
    section: 'account',
    route: '/preferences',
    iconKey: 'settings',
    titleKey: 'profile.sections.preferences',
    hintKey: 'profile.sections.preferencesHint',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: 'mixed',
  },
  {
    id: 'ai-settings',
    section: 'account',
    route: '/ai-settings',
    iconKey: 'sparkles',
    titleKey: 'profile.sections.aiFeatures',
    hintKey: 'profile.sections.aiFeaturesHint',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: 'mixed',
  },
  {
    id: 'retrospective',
    section: 'features',
    route: '/retrospective',
    iconKey: 'retrospective',
    titleKey: 'profile.retrospectiveTitle',
    hintKey: 'profile.retrospectiveHint',
    variant: 'primary',
    proBadge: true,
    hintMode: 'static',
    entitlementRequirement: 'yearlyPro',
    entitlementMode: 'redirect',
  },
  {
    id: 'achievements',
    section: 'features',
    route: '/achievements',
    iconKey: 'achievements',
    titleKey: 'gamification.profileCard.title',
    hintKey: 'gamification.profileCard.hint',
    variant: 'primary',
    proBadge: true,
    hintMode: 'gamificationProfile',
    entitlementRequirement: 'pro',
    entitlementMode: 'redirect',
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
  {
    id: 'advanced',
    section: 'features',
    route: '/advanced',
    iconKey: 'wrench',
    titleKey: 'profile.sections.advanced',
    hintKey: 'profile.sections.advancedHint',
    variant: 'default',
    proBadge: false,
    hintMode: 'static',
    entitlementRequirement: null,
    entitlementMode: 'mixed',
  },
]

export function isProfileNavItemLocked(
  item: Pick<ProfileNavItem, 'entitlementRequirement'>,
  profile: Pick<Profile, 'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'> | null | undefined,
): boolean {
  return !canAccessEntitlement(profile, item.entitlementRequirement)
}

export function shouldRedirectProfileNavItem(
  item: Pick<ProfileNavItem, 'entitlementMode' | 'entitlementRequirement'>,
  profile: Pick<Profile, 'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'> | null | undefined,
): boolean {
  if (item.entitlementMode !== 'redirect') {
    return false
  }

  return !canAccessEntitlement(profile, item.entitlementRequirement)
}
