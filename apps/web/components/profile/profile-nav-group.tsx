'use client'

import { useTranslations } from 'next-intl'
import {
  resolveProfileNavHint,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'

interface ProfileNavGroupProps {
  labelKey: string
  items: ProfileNavItem[]
  hasProAccess?: boolean
  gamificationProfile?: { level: number; totalXp: number } | null
  navTourMap?: Record<string, string>
  onNavClick: (item: ProfileNavItem) => void
}

/** A labeled profile/explore nav group: a section label plus a SettingsGroup of nav rows. */
export function ProfileNavGroup({
  labelKey,
  items,
  hasProAccess,
  gamificationProfile,
  navTourMap,
  onNavClick,
}: Readonly<ProfileNavGroupProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t(labelKey)}</SectionLabel>
      <nav aria-label={t(labelKey)}>
        <SettingsGroup>
          {items.map((item) => (
            <SettingsGroupRow
              key={item.id}
              icon={<ProfileNavIcon iconKey={item.iconKey} />}
              label={t(item.titleKey)}
              hint={resolveProfileNavHint(item, { hasProAccess, gamificationProfile }, t)}
              proBadge={item.proBadge}
              proBadgeLabel={t('common.proBadge')}
              dataTour={navTourMap?.[item.id]}
              onClick={() => onNavClick(item)}
            />
          ))}
        </SettingsGroup>
      </nav>
    </div>
  )
}
