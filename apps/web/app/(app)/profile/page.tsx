'use client'

import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { ProfileSettingsContent } from './_components/profile-settings-content'

export default function ProfilePage() {
  const t = useTranslations()
  const { profile, isLoading, error, patchProfile } = useProfile()

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {error ? (
        <p className="px-4 text-center font-sans text-[14px] text-[var(--status-bad-text)]">
          {process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : t('errors.loadProfile')}
        </p>
      ) : null}
      <ProfileSettingsContent
        profile={profile}
        isLoading={isLoading}
        patchProfile={patchProfile}
      />
    </div>
  )
}
