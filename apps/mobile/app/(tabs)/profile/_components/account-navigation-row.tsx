import { useState } from 'react'
import type { Profile } from '@orbit/shared/types/profile'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { PersonalText } from '@/components/ui/personal-text'
import { Sheet } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function AccountNavigationRow({ profile, submenu }: Readonly<{ profile: Profile | undefined; submenu: typeof PROFILE_SUBMENUS[number] }>) {
  const [expanded, setExpanded] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  const router = useRouter()
  const name = profile?.name ?? t(submenu.labelKey)
  const label = t('profile.submenus.accountLabel', { name, email: profile?.email ?? '' })
  return <>
    <ListRow compact icon={<ProfileNavIcon iconKey={submenu.iconKey} />} textMode="personal" title={name} description={profile?.email} accessibilityLabel={label} onClick={() => router.push(submenu.route)} action={profile?.email ? { icon: 'chevron-down', label: `${t('contextMenu.viewDetails')}, ${label}`, onPress: () => setExpanded(true) } : undefined} />
    {expanded ? <Sheet onClose={() => setExpanded(false)} title={t('contextMenu.viewDetails')}><PersonalText expanded style={{ fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4, color: tokens.fg1 }}>{name}</PersonalText>{profile?.email ? <PersonalText expanded style={{ fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 22.4, color: tokens.fg1 }}>{profile.email}</PersonalText> : null}</Sheet> : null}
  </>
}
