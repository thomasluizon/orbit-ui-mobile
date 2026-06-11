'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** ob-2 onboarding step: tinted hero disc + Astra intro in the kit chat-bubble language. */
export function OnboardingMeetAstra() {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center" style={{ gap: 22, padding: '24px 0 0' }}>
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 116,
          height: 116,
          background: 'rgba(var(--primary-rgb), 0.14)',
        }}
      >
        <Sparkles
          size={54}
          strokeWidth={1.8}
          style={{ color: 'var(--primary-soft)' }}
          aria-hidden="true"
        />
      </div>

      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.meetAstra.title')}
      </div>

      <div className="flex w-full items-start" style={{ gap: 10, maxWidth: 340 }}>
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 30,
            height: 30,
            background: 'rgba(var(--primary-rgb), 0.18)',
          }}
          aria-hidden="true"
        >
          <Sparkles size={16} style={{ color: 'var(--primary-soft)' }} />
        </span>
        <div
          style={{
            background: 'var(--bg-elev)',
            borderRadius: '4px 18px 18px 18px',
            padding: '12px 15px',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--fg-1)',
          }}
        >
          {t('onboarding.flow.meetAstra.subtitle')}
        </div>
      </div>
    </div>
  )
}
