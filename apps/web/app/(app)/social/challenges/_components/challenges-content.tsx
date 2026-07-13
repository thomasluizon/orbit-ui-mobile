'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { PillButton } from '@/components/ui/pill-button'
import { SocialOptInGate } from '../../_components/social-opt-in-gate'
import { ChallengeList } from './challenge-list'

interface ChallengesContentProps {
  isLoading: boolean
  socialEnabled: boolean
  isError: boolean
  challenges: ChallengeListItem[]
  onRetry: () => void
  onOpen: (id: string) => void
  onCreate: () => void
  onJoin: () => void
}

export function ChallengesContent({
  isLoading,
  socialEnabled,
  isError,
  challenges,
  onRetry,
  onOpen,
  onCreate,
  onJoin,
}: Readonly<ChallengesContentProps>) {
  const t = useTranslations()

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className="flex justify-center"
        style={{ padding: 48, color: 'var(--fg-3)' }}
      >
        <Loader2 className="animate-spin" size={22} aria-hidden="true" />
      </div>
    )
  }

  if (!socialEnabled) {
    return <SocialOptInGate />
  }

  if (isError) {
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

  return (
    <>
      <div className="flex md:hidden" style={{ gap: 8, padding: '8px 20px 4px' }}>
        <PillButton onClick={onCreate}>{t('challenges.actions.create')}</PillButton>
        <PillButton variant="ghost" onClick={onJoin}>
          {t('challenges.actions.join')}
        </PillButton>
      </div>
      <ChallengeList
        challenges={challenges}
        onOpen={onOpen}
        onCreate={onCreate}
        onJoin={onJoin}
      />
    </>
  )
}
