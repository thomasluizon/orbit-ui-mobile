'use client'

import { useTranslations } from 'next-intl'
import {
  resolveProfileNavHint,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'

interface ProfileNavSectionsProps {
  accountNavItems: ProfileNavItem[]
  navTourMap: Record<string, string>
  hasProAccess?: boolean
  gamificationProfile?: { level: number; totalXp: number } | null
  onNavClick: (item: ProfileNavItem) => void
}

export function ProfileNavSections({
  accountNavItems,
  navTourMap,
  hasProAccess,
  gamificationProfile,
  onNavClick,
}: Readonly<ProfileNavSectionsProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t('profile.sections.account')}</SectionLabel>
      <nav aria-label={t('profile.sections.account')} className="px-5">
        <SettingsGroup>
          {accountNavItems.map((item) => (
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
  )
}
