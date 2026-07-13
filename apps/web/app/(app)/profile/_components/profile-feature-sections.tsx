'use client'

import { useTranslations } from 'next-intl'
import {
  PROFILE_NAV_ITEMS,
  resolveProfileNavHint,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'

const PROFILE_FEATURE_SECTIONS = [
  { labelKey: 'nav.social', ids: ['social'] },
  { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped'] },
  { labelKey: 'explore.sections.integrations', ids: ['calendar-sync'] },
  { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
].map((section) => ({
  labelKey: section.labelKey,
  items: PROFILE_NAV_ITEMS.filter((item) => section.ids.includes(item.id)),
}))

interface ProfileFeatureSectionsProps {
  hasProAccess?: boolean
  gamificationProfile?: { level: number; totalXp: number } | null
  navTourMap: Record<string, string>
  onNavClick: (item: ProfileNavItem) => void
  onTourReplay: () => void
}

export function ProfileFeatureSections({
  hasProAccess,
  gamificationProfile,
  navTourMap,
  onNavClick,
  onTourReplay,
}: Readonly<ProfileFeatureSectionsProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t('explore.sections.discover')}</SectionLabel>
      <nav aria-label={t('explore.sections.discover')} className="px-5">
        <SettingsGroup>
          <SettingsGroupRow
            icon={<ProfileNavIcon iconKey="compass" />}
            label={t('tour.replay.title')}
            hint={t('explore.tourHint')}
            onClick={onTourReplay}
          />
        </SettingsGroup>
      </nav>
      {PROFILE_FEATURE_SECTIONS.map((section) => (
        <div key={section.labelKey}>
          <SectionLabel>{t(section.labelKey)}</SectionLabel>
          <nav aria-label={t(section.labelKey)} className="px-5">
            <SettingsGroup>
              {section.items.map((item) => (
                <SettingsGroupRow
                  key={item.id}
                  icon={<ProfileNavIcon iconKey={item.iconKey} />}
                  label={t(item.titleKey)}
                  hint={resolveProfileNavHint(
                    item,
                    { hasProAccess, gamificationProfile },
                    t,
                  )}
                  proBadge={item.proBadge}
                  proBadgeLabel={t('common.proBadge')}
                  dataTour={navTourMap[item.id]}
                  onClick={() => onNavClick(item)}
                />
              ))}
            </SettingsGroup>
          </nav>
        </div>
      ))}
    </div>
  )
}
