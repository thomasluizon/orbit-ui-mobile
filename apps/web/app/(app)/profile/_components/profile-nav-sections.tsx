'use client'

import { useTranslations } from 'next-intl'
import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from './profile-nav-icon'

interface ProfileNavSectionsProps {
  accountNavItems: ProfileNavItem[]
  featureNavItems: ProfileNavItem[]
  navTourMap: Record<string, string>
  hasProAccess: boolean
  gamificationProfile: GamificationProfile | null
  onNavClick: (item: ProfileNavItem) => void
  onTourReplay: () => void
}

export function ProfileNavSections({
  accountNavItems,
  featureNavItems,
  navTourMap,
  hasProAccess,
  gamificationProfile,
  onNavClick,
  onTourReplay,
}: Readonly<ProfileNavSectionsProps>) {
  const t = useTranslations()

  const getNavHint = (item: ProfileNavItem): string => {
    if (
      item.hintMode === 'gamificationProfile' &&
      hasProAccess &&
      gamificationProfile
    ) {
      return `${t('gamification.profileCard.level', { level: gamificationProfile.level })} · ${t('gamification.profileCard.totalXp', { total: gamificationProfile.totalXp })}`
    }
    return t(item.hintKey)
  }

  return (
    <>
      <div>
        <SectionLabel>{t('profile.sections.account')}</SectionLabel>
        <nav aria-label={t('profile.sections.account')} className="px-5">
          <SettingsGroup>
            {accountNavItems.map((item) => (
              <SettingsGroupRow
                key={item.id}
                icon={<ProfileNavIcon iconKey={item.iconKey} />}
                label={t(item.titleKey)}
                hint={getNavHint(item)}
                proBadge={item.proBadge}
                proBadgeLabel={t('common.proBadge')}
                dataTour={navTourMap[item.id]}
                onClick={() => onNavClick(item)}
              />
            ))}
          </SettingsGroup>
        </nav>
      </div>

      <div>
        <SectionLabel>{t('profile.sections.features')}</SectionLabel>
        <div className="px-5">
          <SettingsGroup>
            <SettingsGroupRow
              icon={<ProfileNavIcon iconKey="compass" />}
              label={t('tour.replay.title')}
              hint={t('tour.replay.hint')}
              onClick={onTourReplay}
            />
            {featureNavItems.map((item) => (
              <SettingsGroupRow
                key={item.id}
                icon={<ProfileNavIcon iconKey={item.iconKey} />}
                label={t(item.titleKey)}
                hint={getNavHint(item)}
                proBadge={item.proBadge}
                proBadgeLabel={t('common.proBadge')}
                dataTour={navTourMap[item.id]}
                onClick={() => onNavClick(item)}
              />
            ))}
          </SettingsGroup>
        </div>
      </div>
    </>
  )
}
