'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ABOUT_DESTINATIONS } from '@orbit/shared/utils'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { PageHeader } from '@/components/ui/page-header'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { RowList } from '@/components/ui/row-list'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { getAppVersion } from '@/lib/app-version'

interface AboutFactProps {
  id: 'version' | 'account'
  label: string
  value: string
}

function AboutFact({ id, label, value }: Readonly<AboutFactProps>) {
  const [expanded, setExpanded] = useState(false)
  const Root = id === 'account' ? 'button' : 'div'
  const Value = id === 'account' ? PersonalText : 'span'
  return (
    <Root
      type={id === 'account' ? 'button' : undefined}
      aria-label={id === 'account' ? `${label} ${value}` : undefined}
      aria-expanded={id === 'account' ? expanded : undefined}
      onClick={id === 'account' ? () => setExpanded(!expanded) : undefined}
      className={`flex min-w-0 flex-wrap ${id === 'account' ? 'min-h-[48px] w-full cursor-pointer rounded-[12px] border-0 bg-transparent p-2 text-start hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]' : ''}`}
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
      <Value
        expanded={id === 'account' ? expanded : undefined}
        data-testid={`about-fact-${id}-value`}
        style={{
          flex: '0 1 auto',
          minWidth: 0,
          color: 'var(--fg-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.6,
          overflowWrap: id === 'account' ? 'normal' : 'anywhere',
        }}
      >
        {value}
      </Value>
    </Root>
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
  const appVersion = getAppVersion()

  return (
    <div className="min-w-0 md:mx-auto md:w-full md:max-w-[620px]">
      <div className="flex min-w-0 flex-col">
        <PageHeader
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('about.title')}
        />
        <div className="min-h-0 min-w-0 flex-1">
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
                {ABOUT_DESTINATIONS.map((destination) => (
                  <ListRow
                    key={destination.id}
                    accessibilityLabel={t(destination.titleKey)}
                    onClick={() => destination.route ? router.push(destination.route) : setShowGuide(true)}
                    title={t(destination.titleKey)}
                    titleTranslate={destination.titleTranslate}
                    compact
                    wrapTitle
                  />
                ))}
              </RowList>
            </div>

            <div
              className="flex min-w-0 flex-col"
              data-testid="about-facts"
              style={{ gap: 8 }}
            >
              {appVersion ? (
                <AboutFact
                  id="version"
                  label={t('about.versionLabel')}
                  value={appVersion}
                />
              ) : null}
              {isAuthenticated ? (
                <ProfileAccountFact label={t('about.accountLabel')} />
              ) : null}
            </div>

          </div>
        </div>
        <FeatureGuideDrawer open={showGuide} onOpenChange={setShowGuide} />
      </div>
    </div>
  )
}
