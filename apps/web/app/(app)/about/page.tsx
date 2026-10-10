'use client'

import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ABOUT_DESTINATIONS } from '@orbit/shared/utils'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { PageHeader } from '@/components/ui/page-header'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { RowList } from '@/components/ui/row-list'
import { useBackLabel } from '@/hooks/use-back-label'
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
  if (id === 'account') return <AboutAccountFact label={label} value={value} />
  return <div className="flex min-w-0 flex-wrap" data-testid="about-fact-version" style={{ columnGap: 12, rowGap: 4 }}>
    <span data-testid="about-fact-version-label" style={{ flex: '1 1 auto', minWidth: 0, color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.5 }}>{label}</span>
    <span data-testid="about-fact-version-value" style={{ flex: '0 1 auto', minWidth: 0, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1.6, overflowWrap: 'anywhere' }}>{value}</span>
  </div>
}

function AboutAccountFact({ label, value }: Readonly<Pick<AboutFactProps, 'label' | 'value'>>) {
  const [expanded, setExpanded] = useState(false)
  return <PersonalTextAction label={`${label} ${value}`} className="-mx-2" contentClassName="flex min-w-0 flex-wrap min-h-[48px] rounded-[12px] p-2 text-start" contentStyle={{ columnGap: 12, rowGap: 4 }} control={<button type="button" aria-label={`${label} ${value}`} aria-expanded={expanded} aria-controls="about-account-value" onClick={() => setExpanded(!expanded)}
    className="orbit-hover-text flex min-w-0 flex-wrap min-h-[48px] w-full cursor-pointer rounded-[12px] border-0 bg-transparent p-2 text-start touch-manipulation transition-[background-color] duration-[var(--dur-hover)] ease-[var(--ease-standard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)]"
    data-testid="about-fact-account" style={{ columnGap: 12, rowGap: 4 }}>
    <span data-testid="about-fact-account-label" style={{ flex: '1 1 auto', minWidth: 0, color: 'var(--fg-3)', fontSize: 14, lineHeight: 1.5 }}>{label}</span>
    <ChevronDown aria-hidden="true" size={20} strokeWidth={1.5} className={expanded ? 'shrink-0 rotate-180' : 'shrink-0'} />
    <PersonalText id="about-account-value" expanded={expanded} data-testid="about-fact-account-value" style={{ flex: '1 1 100%', minWidth: 0, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1.6 }}>{value}</PersonalText>
  </button>} />
}

function ProfileAccountFact({ label }: Readonly<{ label: string }>) {
  const { profile } = useProfile()

  return <AboutFact id="account" label={label} value={profile?.email ?? ''} />
}

export default function AboutPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const backLabel = useBackLabel('/profile')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [showGuide, setShowGuide] = useState(false)
  const appVersion = getAppVersion()

  return (
    <div className="min-w-0 w-full">
      <div className="flex min-w-0 flex-col">
        <PageHeader
          backLabel={backLabel}
          onBack={() => goBackOrFallback('/profile')}
          title={t('about.title')}
        />
        <div className="min-h-0 min-w-0 flex-1">
          <div
            className="orbit-content-frame flex flex-col py-4"
            data-testid="about-content"
            data-content-cap="about"
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
