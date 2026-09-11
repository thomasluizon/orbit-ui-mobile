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

export interface ProfileNavSectionDefinition {
  labelKey: string
  ids: readonly string[]
}

export interface ProfileNavSectionGroup {
  labelKey: string
  items: ProfileNavItem[]
}

/**
 * Expands section definitions (label + member ids) into rendered groups by
 * selecting the matching {@link PROFILE_NAV_ITEMS} for each section.
 */
export function buildProfileNavSections(
  definitions: readonly ProfileNavSectionDefinition[],
): ProfileNavSectionGroup[] {
  return definitions.map((section) => ({
    labelKey: section.labelKey,
    items: PROFILE_NAV_ITEMS.filter((item) => section.ids.includes(item.id)),
  }))
}

export type ProfileNavTranslationAdapter = (
  key: string,
  values?: Record<string, string | number>,
) => string

export interface ProfileNavHintContext {
  hasProAccess: boolean | undefined
  gamificationProfile: { level: number; totalXp: number } | null | undefined
}

/**
 * Resolves the hint line for a profile nav row: gamification rows show
 * "Level N · X XP" for pro users with a loaded gamification profile,
 * everything else falls back to the item's static hint key.
 */
export function resolveProfileNavHint(
  item: Pick<ProfileNavItem, 'hintMode' | 'hintKey'>,
  context: ProfileNavHintContext,
  translate: ProfileNavTranslationAdapter,
): string {
  if (
    item.hintMode === 'gamificationProfile' &&
    context.hasProAccess &&
    context.gamificationProfile
  ) {
    return `${translate('gamification.profileCard.level', { level: context.gamificationProfile.level })} · ${translate('gamification.profileCard.totalXp', { total: context.gamificationProfile.totalXp })}`
  }
  return translate(item.hintKey)
}

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
