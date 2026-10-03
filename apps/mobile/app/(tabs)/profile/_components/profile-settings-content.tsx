import { useRouter } from 'expo-router'
import { WidgetInfoSheet } from '@/components/profile/advanced-sections'
import {
  PROFILE_NAV_ITEMS,
  PROFILE_SUBMENUS,
  getProfileProEntry,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import {
  ProfileSettingsFrame,
} from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { useLogout } from '@/hooks/use-logout'
import { buildUpgradeHref } from '@/lib/upgrade-route'

import type { Profile } from '@orbit/shared/types/profile'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { LogOut } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ProfileSettingsContentProps {
  profile: Profile | undefined
  isLoading: boolean
  patchProfile: (patch: Partial<Profile>) => void
}

type Translate = ReturnType<typeof useTranslation>['t']
type Router = ReturnType<typeof useRouter>

interface RowContext {
  profile: Profile | undefined
  router: Router
  t: Translate
}

function buildMoreRows({ context: { profile, router, t }, openWidget }: Readonly<{
  context: RowContext
  openWidget: () => void
}>) {
  const navigationRows = PROFILE_NAV_ITEMS.map((item) => {
    const redirectsToUpgrade = shouldRedirectProfileNavItem(item, profile)
    return (
      <ListRow
        key={item.id}
        textMode="label"
        compact={!item.hintKey}
        icon={<ProfileNavIcon iconKey={item.iconKey} />}
        title={t(item.titleKey)}
        description={item.hintKey ? t(item.hintKey) : undefined}
        trailing={item.proBadge && redirectsToUpgrade ? <ProBadge alwaysVisible /> : undefined}
        chevron={!redirectsToUpgrade}
        onClick={() => {
          if (item.action === 'openWidget') {
            openWidget()
            return
          }
          if (redirectsToUpgrade) {
            router.push(buildUpgradeHref('/profile'))
            return
          }
          router.push(item.route)
        }}
      />
    )
  })

  return navigationRows
}

export function ProfileSettingsContent({ profile, isLoading }: Readonly<ProfileSettingsContentProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useLogout()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const context = { profile, router, t }
  const proEntry = profile ? getProfileProEntry(profile, t) : undefined
  const rows = {
    you: PROFILE_SUBMENUS.flatMap((submenu) => {
      const row = <ListRow
        key={submenu.id}
        compact
        icon={<ProfileNavIcon iconKey={submenu.iconKey} />}
        textMode={submenu.id === 'account' ? 'personal' : 'label'}
        title={submenu.id === 'account' ? profile?.name ?? t(submenu.labelKey) : t(submenu.labelKey)}
        accessibilityLabel={submenu.id === 'account' ? t('profile.submenus.accountLabel', { name: profile?.name ?? t(submenu.labelKey), email: profile?.email ?? '' }) : t(submenu.labelKey)}
        description={submenu.id === 'account' ? profile?.email : undefined}
        onClick={() => router.push(submenu.route)}
      />
      if (submenu.id !== 'account' || !proEntry) return [row]
      return [row, <ListRow
        key="orbit-pro"
        compact
        icon={<ProfileNavIcon iconKey="pro" />}
        textMode="label"
        title={t('upgrade.pitchTitle')}
        value={proEntry.value}
        chevron={Boolean(proEntry.href)}
        readOnly={!proEntry.href}
        onClick={proEntry.href ? () => router.push('/upgrade') : undefined}
      />]
    }),
    more: buildMoreRows({ context, openWidget: () => setShowWidgetInfo(true) }),
    /* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 428 controls this label under D42. */
    ending: <ListRow textMode="label" compact icon={<LogOut size={24} strokeWidth={1.8} />} title={t('profile.settingsRows.signOut')} chevron={false} onClick={() => void logout()} />,
  }
  return <>
    <ProfileSettingsFrame isLoading={isLoading} loadingLabel={t('profile.loading')} labels={{ more: t('profile.groups.more') }} rows={rows} />
      <WidgetInfoSheet open={showWidgetInfo} onClose={() => setShowWidgetInfo(false)} t={t} tokens={tokens} />
  </>
}
