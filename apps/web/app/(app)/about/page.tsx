'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SettingsRow } from '@/components/ui/settings-row'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useReferral } from '@/hooks/use-referral'

export default function AboutPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const [showGuide, setShowGuide] = useState(false)
  const [showReferral, setShowReferral] = useState(false)
  const { stats } = useReferral()

  const referralValue = stats
    ? t('referral.card.progress', {
        count: stats.successfulReferrals,
        max: stats.maxReferrals,
      })
    : undefined

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SettingsRow
          label={t('onboarding.featureGuide.openButton')}
          onClick={() => setShowGuide(true)}
          ariaLabel={t('onboarding.featureGuide.openButton')}
        />
        <SettingsRow
          label={t('referral.card.title')}
          value={referralValue}
          mono
          onClick={() => setShowReferral(true)}
          ariaLabel={t('referral.card.title')}
        />
        <SettingsRow
          label={t('profile.support.title')}
          onClick={() => router.push('/support')}
          ariaLabel={t('profile.support.title')}
        />
        <SettingsRow
          label={t('privacy.title')}
          onClick={() => router.push('/privacy')}
          ariaLabel={t('privacy.title')}
        />
      </div>
      <ReferralDrawer open={showReferral} onOpenChange={setShowReferral} />
      <FeatureGuideDrawer open={showGuide} onOpenChange={setShowGuide} />
    </div>
  )
}
