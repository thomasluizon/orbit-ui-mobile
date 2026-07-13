'use client'

import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

export default function PrivacyPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const sections: { label: string; body: string | string[] }[] = [
    { label: t('privacy.intro.title'), body: t('privacy.intro.body') },
    { label: t('privacy.controller.title'), body: t('privacy.controller.body') },
    { label: t('privacy.dataCollected.title'), body: [
      t('privacy.dataCollected.account'),
      t('privacy.dataCollected.habits'),
      t('privacy.dataCollected.chat'),
      t('privacy.dataCollected.preferences'),
      t('privacy.dataCollected.device'),
    ] },
    { label: t('privacy.howWeUse.title'), body: [
      t('privacy.howWeUse.provide'),
      t('privacy.howWeUse.personalize'),
      t('privacy.howWeUse.notifications'),
    ] },
    { label: t('privacy.thirdParty.title'), body: [
      t('privacy.thirdParty.intro'),
      t('privacy.thirdParty.google'),
      t('privacy.thirdParty.stripe'),
      t('privacy.thirdParty.firebase'),
      t('privacy.thirdParty.openai'),
      t('privacy.thirdParty.resend'),
      t('privacy.thirdParty.googlePlay'),
      t('privacy.thirdParty.admob'),
      t('privacy.thirdParty.sentry'),
    ] },
    { label: t('privacy.retention.title'), body: [
      t('privacy.retention.intro'),
      t('privacy.retention.account'),
      t('privacy.retention.sessions'),
      t('privacy.retention.ai'),
      t('privacy.retention.afterDeletion'),
    ] },
    { label: t('privacy.googleScopes.title'), body: [
      t('privacy.googleScopes.intro'),
      t('privacy.googleScopes.auth'),
      t('privacy.googleScopes.calendar'),
      t('privacy.googleScopes.control'),
    ] },
    { label: t('privacy.dataResidency.title'), body: t('privacy.dataResidency.body') },
    { label: t('privacy.automatedProcessing.title'), body: t('privacy.automatedProcessing.body') },
    { label: t('privacy.minors.title'), body: t('privacy.minors.body') },
    { label: t('privacy.export.title'), body: t('privacy.export.body') },
    { label: t('privacy.noSell.title'), body: t('privacy.noSell.body') },
    { label: t('privacy.security.title'), body: t('privacy.security.body') },
    { label: t('privacy.deletion.title'), body: [
      t('privacy.deletion.body'),
      t('privacy.deletion.step1'),
      t('privacy.deletion.step2'),
      t('privacy.deletion.step3'),
      t('privacy.deletion.step4'),
    ] },
    { label: t('privacy.contact.title'), body: t('privacy.contact.body') },
  ]

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[var(--app-max-w)] flex-col">
      <AppBar
        back
        backLabel={t('common.goBack')}
        onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        title={t('privacy.title')}
        subtitle={t('privacy.lastUpdated')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sections.map(({ label, body }) => (
          <div key={label}>
            <SectionLabel>{label}</SectionLabel>
            {Array.isArray(body) ? (
              <div className="flex flex-col px-5 pb-[18px]" style={{ gap: 6 }}>
                {body.map((line, index) => (
                  // react-doctor-disable-next-line no-array-index-as-key -- static legal-text lines; the list never reorders or filters https://github.com/thomasluizon/orbit-ui-mobile/issues/243
                  <div
                    key={`${label}-${index}`}
                    className="t-secondary"
                    style={{ textWrap: 'pretty' }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className="t-secondary px-5 pb-[18px]" style={{ textWrap: 'pretty' }}>
                {body}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
