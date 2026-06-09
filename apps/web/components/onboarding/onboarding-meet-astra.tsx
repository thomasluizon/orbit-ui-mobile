'use client'

import { Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PullQuote } from '@/components/chat/pull-quote'

/** v8 onboarding step: rotating orbit ring + Orbit icon, italic Astra prose. */
export function OnboardingMeetAstra() {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center" style={{ gap: 22, padding: '32px 0 0' }}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: 92, height: 92 }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: 'inset 0 0 0 1.5px var(--primary)',
            animation: 'spin 3.6s linear infinite',
          }}
        />
        <Orbit
          size={32}
          strokeWidth={1.4}
          style={{ color: 'var(--fg-1)' }}
        />
      </div>

      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.meetAstra.title')}
      </div>

      <div style={{ maxWidth: 340 }}>
        <PullQuote eyebrow={t('chat.title')} italic paddingX={4} paddingY={0}>
          {t('onboarding.flow.meetAstra.subtitle')}
        </PullQuote>
      </div>
    </div>
  )
}
