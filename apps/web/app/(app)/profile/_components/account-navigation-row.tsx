'use client'

import { useState } from 'react'
import type { Profile } from '@orbit/shared/types/profile'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { PersonalText } from '@/components/ui/personal-text'
import { Sheet } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'
import { useTranslations } from 'next-intl'

export function AccountNavigationRow({ profile, submenu }: Readonly<{ profile: Profile | undefined; submenu: typeof PROFILE_SUBMENUS[number] }>) {
  const [expanded, setExpanded] = useState(false)
  const t = useTranslations()
  const name = profile?.name ?? t(submenu.labelKey)
  const label = t('profile.submenus.accountLabel', { name, email: profile?.email ?? '' })
  return <>
    <ListRow compact icon={<ProfileNavIcon iconKey={submenu.iconKey} />} textMode="personal" title={name} description={profile?.email} accessibilityLabel={label} href={submenu.route} action={profile?.email ? { icon: 'chevron-down', label: `${t('contextMenu.viewDetails')}, ${label}`, onPress: () => setExpanded(true) } : undefined} />
    {expanded ? <Sheet onClose={() => setExpanded(false)} title={t('contextMenu.viewDetails')}><PersonalText expanded>{name}</PersonalText>{profile?.email ? <PersonalText expanded>{profile.email}</PersonalText> : null}</Sheet> : null}
  </>
}
