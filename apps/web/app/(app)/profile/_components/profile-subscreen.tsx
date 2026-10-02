'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ProfileSubmenuId } from '@orbit/shared/utils/profile-navigation'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { PageHeader } from '@/components/ui/page-header'
import { useProfile } from '@/hooks/use-profile'
import { ProfileAccountContent } from './profile-account-content'
import { ProfilePreferencesContent } from './profile-preferences-content'
import { ProfileAstraContent } from './profile-astra-content'
import { ProfileNotificationsContent } from './profile-notifications-content'
import { Skeleton } from '@/components/ui/skeleton'

const CONTENT = {
  account: ProfileAccountContent,
  preferences: ProfilePreferencesContent,
  astra: ProfileAstraContent,
  notifications: ProfileNotificationsContent,
}

export function ProfileSubscreen({ screen }: Readonly<{ screen: ProfileSubmenuId }>) {
  const t = useTranslations()
  const router = useRouter()
  const { profile, isLoading, error, refetch, patchProfile } = useProfile()
  const submenu = PROFILE_SUBMENUS.find((entry) => entry.id === screen)!
  const Content = CONTENT[screen]
  return <div className="mx-auto w-full max-w-[560px] min-w-0">
    <PageHeader title={t(submenu.labelKey)} backLabel={t('common.backToProfile')} onBack={() => router.replace('/profile')} />
    <div className="flex min-w-0 flex-col p-4" style={{ gap: 12 }} data-testid={`profile-settings-group-${screen}`}>
      {isLoading ? <Skeleton variant="settings" rows={8} label={t('profile.loading')} /> : error ? <ErrorState message={t('errors.loadProfile')} action={<PillButton variant="ghost" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} /> : <Content profile={profile} patchProfile={patchProfile} />}
    </div>
  </div>
}
