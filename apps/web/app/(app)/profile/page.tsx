'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProfileSectionDestination } from '@orbit/shared/utils/profile-routes'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { ProfileSettingsContent } from './_components/profile-settings-content'

export default function ProfilePage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    const destination = getProfileSectionDestination(searchParams.toString(), globalThis.location.hash)
    if (destination) router.replace(destination)
  }, [router, searchParams])
  const { profile, isLoading, error, patchProfile } = useProfile()

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <h1 className="sr-only" tabIndex={-1}>{t('nav.profile')}</h1>
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
