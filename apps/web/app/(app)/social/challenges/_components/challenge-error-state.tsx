'use client'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface ChallengeErrorStateProps {
  onRetry: () => void
}

/** Shared load-failure state for the challenges list and detail views: a message plus a retry CTA. */
export function ChallengeErrorState({ onRetry }: Readonly<ChallengeErrorStateProps>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center px-8 py-12 text-center" style={{ gap: 12 }}>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--fg-3)',
        }}
      >
        {t('challenges.errors.loadFailed')}
      </p>
      <PillButton variant="ghost" onClick={onRetry}>
        {t('common.retry')}
      </PillButton>
    </div>
  )
}
