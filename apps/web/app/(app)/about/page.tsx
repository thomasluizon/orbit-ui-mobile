'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Compass, Mail, Orbit, Shield, UserPlus } from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { SettingsRow } from '@/components/ui/settings-row'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useReferral } from '@/hooks/use-referral'
import packageJson from '@/package.json'

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
        <div
          className="flex flex-col items-center"
          style={{ gap: 10, padding: '24px 0 20px' }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: 'var(--primary)',
              boxShadow: 'var(--primary-glow)',
            }}
          >
            <Orbit
              size={38}
              strokeWidth={2}
              color="var(--fg-on-primary)"
              aria-hidden="true"
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t('common.appName')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('about.version', { version: packageJson.version })}
          </span>
        </div>
        <SettingsRow
          icon={Compass}
          label={t('onboarding.featureGuide.openButton')}
          onClick={() => setShowGuide(true)}
          ariaLabel={t('onboarding.featureGuide.openButton')}
        />
        <SettingsRow
          icon={UserPlus}
          label={t('referral.card.title')}
          value={referralValue}
          mono
          onClick={() => setShowReferral(true)}
          ariaLabel={t('referral.card.title')}
        />
        <SettingsRow
          icon={Mail}
          label={t('profile.support.title')}
          onClick={() => router.push('/support')}
          ariaLabel={t('profile.support.title')}
        />
        <SettingsRow
          icon={Shield}
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
