'use client'

import { useTranslations } from 'next-intl'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { SkeletonLine } from '@/components/ui/skeleton'
import { SocialOptInGate } from '../../_components/social-opt-in-gate'
import { ChallengeActionButtons } from './challenge-action-buttons'
import { ChallengeErrorState } from './challenge-error-state'
import { ChallengeList } from './challenge-list'

function ChallengeCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col"
      style={{
        gap: 10,
        padding: 16,
        borderRadius: 18,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <SkeletonLine width="w-24" height="h-5" />
      <SkeletonLine width="w-2/3" height="h-4" />
      <SkeletonLine width="w-1/3" height="h-3" />
    </div>
  )
}

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
        className="flex flex-col"
        style={{ gap: 10, padding: '12px 20px 24px' }}
      >
        {Array.from({ length: 3 }, (_, index) => (
          <ChallengeCardSkeleton key={index} />
        ))}
      </div>
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
