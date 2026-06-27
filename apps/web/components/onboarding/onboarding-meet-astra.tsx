'use client'

import { useTranslations } from 'next-intl'
import { AstraAvatar } from '@/components/ui/astra-avatar'

/** ob-2 onboarding step: tinted hero disc + Astra intro in the kit chat-bubble language. */
export function OnboardingMeetAstra() {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center" style={{ gap: 22, padding: '24px 0 0' }}>
      <AstraAvatar
        size={116}
        animate
        label={t('chat.astraAvatarLabel')}
        style={{ animation: 'fresh-start-orb 0.6s var(--ease-out) both' }}
      />

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

      <div
        className="animate-msg-in flex w-full items-start"
        style={{ gap: 10, maxWidth: 340, animationDelay: '200ms' }}
      >
        <AstraAvatar size={30} />
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
