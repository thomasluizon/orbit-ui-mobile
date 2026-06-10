'use client'

import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

export default function DeleteAccountPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const sections: { label: string; body: string }[] = [
    { label: t('deleteAccount.intro.title'), body: t('deleteAccount.intro.body') },
    { label: t('deleteAccount.inApp.title'), body: [
      t('deleteAccount.inApp.intro'),
      t('deleteAccount.inApp.step1'),
      t('deleteAccount.inApp.step2'),
      t('deleteAccount.inApp.step3'),
      t('deleteAccount.inApp.step4'),
    ].join(' ') },
    { label: t('deleteAccount.grace.title'), body: t('deleteAccount.grace.body') },
    { label: t('deleteAccount.data.title'), body: t('deleteAccount.data.body') },
  ]

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        title={t('deleteAccount.title')}
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

        <SectionLabel>{t('deleteAccount.webFallback.title')}</SectionLabel>
        <div
          className="px-5 pb-[18px]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--fg-2)',
          }}
        >
          {t('deleteAccount.webFallback.body')}
        </div>
        <div className="px-5 pb-8">
          <a
            href="mailto:contact@useorbit.org?subject=Account%20deletion%20request"
            className="inline-flex items-center underline"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--primary)',
            }}
          >
            {t('deleteAccount.webFallback.button')}
          </a>
        </div>
      </div>
    </div>
  )
}
