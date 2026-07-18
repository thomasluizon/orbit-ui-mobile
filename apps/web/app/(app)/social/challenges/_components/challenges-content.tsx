'use client'

import { Loader2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { SocialOptInGate } from '../../_components/social-opt-in-gate'
import { ChallengeActionButtons } from './challenge-action-buttons'
import { ChallengeErrorState } from './challenge-error-state'
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
      <output
        aria-label={t('common.loading')}
        className="flex justify-center"
        style={{ padding: 48, color: 'var(--fg-3)' }}
      >
        <Loader2 className="animate-spin" size={22} aria-hidden="true" />
      </output>
    )
  }

  if (!socialEnabled) {
    return <SocialOptInGate />
  }

  if (isError) {
    return <ChallengeErrorState onRetry={onRetry} />
  }

  return (
    <>
      <div className="flex md:hidden" style={{ gap: 8, padding: '8px 20px 4px' }}>
        <ChallengeActionButtons onCreate={onCreate} onJoin={onJoin} />
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
