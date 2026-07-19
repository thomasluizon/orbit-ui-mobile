'use client'

import { useTranslations } from 'next-intl'
import {
  buildProfileNavSections,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileNavGroup } from '@/components/profile/profile-nav-group'

const PROFILE_FEATURE_SECTIONS = buildProfileNavSections([
  { labelKey: 'nav.social', ids: ['social'] },
  { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped'] },
  { labelKey: 'explore.sections.integrations', ids: ['calendar-sync'] },
  { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
])

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
            dataTestId="profile-tour-replay"
          />
        </SettingsGroup>
      </nav>
      {PROFILE_FEATURE_SECTIONS.map((section) => (
        <ProfileNavGroup
          key={section.labelKey}
          labelKey={section.labelKey}
          items={section.items}
          hasProAccess={hasProAccess}
          gamificationProfile={gamificationProfile}
          navTourMap={navTourMap}
          onNavClick={onNavClick}
        />
      ))}
    </div>
  )
}
