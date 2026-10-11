'use client'

import type { Profile } from '@orbit/shared/types/profile'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ListRow } from '@/components/ui/list-row'
import { useTranslations } from 'next-intl'

export function AccountNavigationRow({ profile, submenu }: Readonly<{ profile: Profile | undefined; submenu: typeof PROFILE_SUBMENUS[number] }>) {
  const t = useTranslations()
  const name = profile?.name ?? t(submenu.labelKey)
  const label = t('profile.submenus.accountLabel', { name, email: profile?.email ?? '' })
  return <ListRow icon={<ProfileNavIcon iconKey={submenu.iconKey} />} textMode="personal" title={name} description={profile?.email} accessibilityLabel={label} href={submenu.route} />
}
