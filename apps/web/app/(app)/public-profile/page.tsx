'use client'

import { useTranslations } from 'next-intl'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { PublicProfileSettings } from '@/components/settings/public-profile-settings'

export default function PublicProfilePage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('profile.publicProfile.title')}
        />
        <h1 className="t-display hidden md:block" style={{ margin: 0, padding: '20px 20px 4px' }}>
          {t('profile.publicProfile.title')}
        </h1>
        <PublicProfileSettings />
      </div>
    </div>
  )
}
