'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Compass, FileText, Mail, Shield } from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { AppLogo } from '@/components/ui/app-logo'
import { SettingsRow } from '@/components/ui/settings-row'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import packageJson from '@/package.json'

export default function AboutPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
        <div
          className="flex flex-col items-center"
          style={{ gap: 10, padding: '24px 0 20px' }}
        >
          <AppLogo size={72} />
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
          icon={Mail}
          label={t('profile.support.title')}
          onClick={() => router.push('/support')}
          ariaLabel={t('profile.support.title')}
        />
        <SettingsRow
          icon={FileText}
          label={t('terms.title')}
          onClick={() => router.push('/terms')}
          ariaLabel={t('terms.title')}
        />
        <SettingsRow
          icon={Shield}
          label={t('privacy.title')}
          onClick={() => router.push('/privacy')}
          ariaLabel={t('privacy.title')}
        />
      </div>
      <FeatureGuideDrawer open={showGuide} onOpenChange={setShowGuide} />
    </div>
  )
}
