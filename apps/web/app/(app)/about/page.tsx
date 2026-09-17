'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { AppBar } from '@/components/ui/app-bar'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { RowList } from '@/components/ui/row-list'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import packageJson from '@/package.json'

interface AboutFactProps {
  id: 'version' | 'account'
  label: string
  value: string
}

function AboutFact({ id, label, value }: Readonly<AboutFactProps>) {
  return (
    <div
      className="flex min-w-0 flex-wrap"
      data-testid={`about-fact-${id}`}
      style={{ columnGap: 12, rowGap: 4 }}
    >
      <span
        data-testid={`about-fact-${id}-label`}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          color: 'var(--fg-3)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {label}
      </span>
      <span
        data-testid={`about-fact-${id}-value`}
        style={{
          flex: '0 1 auto',
          minWidth: 0,
          color: 'var(--fg-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.6,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ProfileAccountFact({ label }: Readonly<{ label: string }>) {
  const { profile } = useProfile()

  return <AboutFact id="account" label={label} value={profile?.email ?? ''} />
}

export default function AboutPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="min-w-0 md:mx-auto md:w-full md:max-w-[620px]">
      <div className="flex min-h-[100dvh] min-w-0 flex-col">
        <AppBar
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('about.title')}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div
            className="flex min-w-0 flex-col p-4"
            data-testid="about-content"
            style={{ gap: 24 }}
          >
            <div
              className="flex min-w-0 flex-col items-start"
              data-testid="about-identity"
              style={{ gap: 12 }}
            >
              <OrbitMark size={48} accent />
              <p
                className="text-[28px] leading-[1.15] md:text-[34px] md:leading-[1.12]"
                translate="no"
                style={{
                  color: 'var(--fg-1)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('common.appName')}
              </p>
              <p
                className="max-w-[38ch] md:max-w-[46ch]"
                style={{
                  color: 'var(--fg-2)',
                  fontSize: 16,
                  lineHeight: 1.55,
                  overflowWrap: 'anywhere',
                  textWrap: 'pretty',
                }}
              >
                {t('about.tagline')}
              </p>
            </div>

            <div className="min-w-0" data-testid="about-destinations">
              <RowList style={{ minWidth: 0 }}>
                <ListRow
                  accessibilityLabel={t('about.featureGuide')}
                  onClick={() => setShowGuide(true)}
                  title={t('about.featureGuide')}
                  wrapTitle
                />
                <ListRow
                  accessibilityLabel={t('profile.support.title')}
                  onClick={() => router.push('/support')}
                  title={t('profile.support.title')}
                  wrapTitle
                />
                <ListRow
                  accessibilityLabel={t('about.terms')}
                  onClick={() => router.push('/terms')}
                  title={t('about.terms')}
                  wrapTitle
                />
                <ListRow
                  accessibilityLabel={t('about.privacy')}
                  onClick={() => router.push('/privacy')}
                  title={t('about.privacy')}
                  wrapTitle
                />
              </RowList>
            </div>

            <div
              className="flex min-w-0 flex-col"
              data-testid="about-facts"
              style={{ gap: 8 }}
            >
              <AboutFact
                id="version"
                label={t('about.versionLabel')}
                value={packageJson.version}
              />
              {isAuthenticated ? (
                <ProfileAccountFact label={t('about.accountLabel')} />
              ) : null}
            </div>

            <p
              data-testid="about-credit"
              style={{
                color: 'var(--fg-3)',
                fontSize: 14,
                lineHeight: 1.55,
                overflowWrap: 'anywhere',
                textWrap: 'pretty',
              }}
            >
              {t('about.credit')}
            </p>
          </div>
        </div>
        <FeatureGuideDrawer open={showGuide} onOpenChange={setShowGuide} />
      </div>
    </div>
  )
}
