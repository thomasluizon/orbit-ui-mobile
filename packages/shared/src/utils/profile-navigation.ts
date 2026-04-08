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
  },
  {
    id: 'calendar-sync',
    section: 'features',
    route: '/calendar-sync',
    iconKey: 'calendar',
    titleKey: 'calendar.profileButton',
    hintKey: 'calendar.profileHint',
    variant: 'primary',
    proBadge: false,
    hintMode: 'static',
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
  },
]
