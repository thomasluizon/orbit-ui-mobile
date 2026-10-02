'use client'

import { useRouter } from 'next/navigation'
import { WidgetInfoOverlay } from '@/components/advanced/advanced-sections'
import {
  PROFILE_NAV_ITEMS,
  PROFILE_SUBMENUS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import {
  ProfileSettingsFrame,
} from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { useAuthStore } from '@/stores/auth-store'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { LogOut } from '@/components/ui/icons'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslations>
type Router = ReturnType<typeof useRouter>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
}

function buildMoreRows({ profile, t }: RowContext, openWidget: () => void) {
  const navigationRows = PROFILE_NAV_ITEMS.map((item) => {
    const redirectsToUpgrade = shouldRedirectProfileNavItem(item, profile)
    const href = redirectsToUpgrade ? '/upgrade' : item.route ?? undefined
    return (
      <ListRow
        key={item.id}
        compact={!item.hintKey}
        icon={<ProfileNavIcon iconKey={item.iconKey} />}
        title={t(item.titleKey)}
        description={item.hintKey ? t(item.hintKey) : undefined}
        trailing={item.proBadge && redirectsToUpgrade ? <ProBadge alwaysVisible /> : undefined}
        chevron={!redirectsToUpgrade}
        href={href}
        onClick={item.action === 'openWidget' ? openWidget : undefined}
      />
    )
  })

  return navigationRows
}

export function ProfileSettingsContent({ profile, isLoading }: Readonly<ProfileSettingsContentProps>) {
  const t = useTranslations()
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const context = { profile, router, t }
  const rows = {
    you: PROFILE_SUBMENUS.map((submenu) => <ListRow
      key={submenu.id}
      compact={submenu.id !== 'account'}
      title={submenu.id === 'account' ? profile?.name ?? t(submenu.labelKey) : t(submenu.labelKey)}
      accessibilityLabel={submenu.id === 'account' ? t('profile.settingsRows.editName', { name: profile?.name ?? t(submenu.labelKey), email: profile?.email ?? '' }) : t(submenu.labelKey)}
      description={submenu.id === 'account' ? profile?.email : undefined}
      href={submenu.route}
    />),
    more: buildMoreRows(context, () => setShowWidgetInfo(true)),
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 428 controls this label under D42. */
    ending: <ListRow compact icon={<LogOut size={24} strokeWidth={1.8} />} title={t('profile.settingsRows.signOut')} chevron={false} onClick={() => void logout()} />,
  }
  return <>
    <ProfileSettingsFrame isLoading={isLoading} loadingLabel={t('profile.loading')} labels={{ more: t('profile.groups.more') }} rows={rows} />
      <WidgetInfoOverlay open={showWidgetInfo} onOpenChange={setShowWidgetInfo} t={t} />
  </>
}
