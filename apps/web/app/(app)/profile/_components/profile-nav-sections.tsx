'use client'

import type { ProfileNavItem } from '@orbit/shared/utils/profile-navigation'
import { ProfileNavGroup } from '@/components/profile/profile-nav-group'

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
  return (
    <ProfileNavGroup
      labelKey="profile.sections.account"
      items={accountNavItems}
      hasProAccess={hasProAccess}
      gamificationProfile={gamificationProfile}
      navTourMap={navTourMap}
      onNavClick={onNavClick}
    />
  )
}
