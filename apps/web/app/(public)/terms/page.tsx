'use client'

import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

export default function TermsPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const sections: { label: string; body: string }[] = [
    { label: t('terms.intro.title'), body: t('terms.intro.body') },
    { label: t('terms.provider.title'), body: t('terms.provider.body') },
    { label: t('terms.eligibility.title'), body: t('terms.eligibility.body') },
    { label: t('terms.license.title'), body: t('terms.license.body') },
    { label: t('terms.subscription.title'), body: [
      t('terms.subscription.intro'),
      t('terms.subscription.autoRenew'),
      t('terms.subscription.cancel'),
      t('terms.subscription.refunds'),
    ].join(' ') },
    { label: t('terms.ai.title'), body: t('terms.ai.body') },
    { label: t('terms.noMedicalAdvice.title'), body: t('terms.noMedicalAdvice.body') },
    { label: t('terms.warranty.title'), body: t('terms.warranty.body') },
    { label: t('terms.liability.title'), body: t('terms.liability.body') },
    { label: t('terms.termination.title'), body: t('terms.termination.body') },
    { label: t('terms.governingLaw.title'), body: t('terms.governingLaw.body') },
    { label: t('terms.changes.title'), body: t('terms.changes.body') },
    { label: t('terms.contact.title'), body: t('terms.contact.body') },
  ]

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        title={t('terms.title')}
        subtitle={t('terms.lastUpdated')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sections.map(({ label, body }) => (
          <div key={label}>
            <SectionLabel>{label}</SectionLabel>
            <div
              className="px-5 pb-[18px]"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--fg-2)',
              }}
            >
              {body}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
