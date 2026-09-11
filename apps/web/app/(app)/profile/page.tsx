'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  PROFILE_NAV_ITEMS,
  shouldRedirectProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { ProfileSettingsFrame } from '@/components/profile/profile-settings-frame'
import { ListRow } from '@/components/ui/list-row'
import { ProBadge } from '@/components/ui/pro-badge'
import { useProfile } from '@/hooks/use-profile'

export default function ProfilePage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile, isLoading, error } = useProfile()
  const groupLabels = {
    you: t('profile.groups.you'),
    astra: t('profile.groups.astra'),
    notifications: t('profile.groups.notifications'),
    more: t('profile.groups.more'),
    ending: t('profile.groups.ending'),
  }

  const moreRows = PROFILE_NAV_ITEMS.map((item) => (
    <ListRow
      key={item.id}
      icon={<ProfileNavIcon iconKey={item.iconKey} />}
      title={t(item.titleKey)}
      description={t(item.hintKey)}
      trailing={item.proBadge ? <ProBadge alwaysVisible /> : undefined}
      onClick={() => {
        router.push(shouldRedirectProfileNavItem(item, profile) ? '/upgrade' : item.route)
      }}
    />
  ))

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {error ? (
        <p className="px-4 text-center font-sans text-[14px] text-[var(--status-bad-text)]">
          {process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : t('errors.loadProfile')}
        </p>
      ) : null}
      <ProfileSettingsFrame
        isLoading={isLoading}
        loadingLabel={t('profile.loading')}
        labels={groupLabels}
        rows={{ more: moreRows }}
      />
    </div>
  )
}
