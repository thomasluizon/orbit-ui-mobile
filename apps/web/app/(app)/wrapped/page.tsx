'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { Button } from '@/components/ui/pill-button'
import { ChevronLeft } from '@/components/ui/icons'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useWrapped } from '@/hooks/use-wrapped'
import { WrappedCover } from './_components/wrapped-cover'
import { WrappedPlayer } from './_components/wrapped-player'

export default function WrappedPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setPeriod(next)
    setIsPlaying(false)
  }

  function startPlayer() {
    if (!recap || isEmpty) return
    setIsPlaying(true)
  }

  async function retryCover() {
    setIsRetrying(true)
    try {
      await refetch()
    } finally {
      setIsRetrying(false)
    }
  }

  const coverState = isLoading || isRetrying
    ? 'loading'
    : isError
      ? 'failed'
      : isEmpty
        ? 'empty'
        : recap
          ? 'ready'
          : 'loading'

  return (
    <main className="relative flex min-h-dvh flex-col">
      {!isPlaying ? (
        <div className="absolute left-4 top-2 z-[1]">
          {/* eslint-disable-next-line local/max-button-words -- ORB-57 requires the existing common.backToProfile copy. */}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            label={t('common.backToProfile')}
            onClick={() => goBackOrFallback('/profile')}
          >
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <WrappedCover
        period={period}
        onSelectPeriod={selectPeriod}
        state={coverState}
        onStart={startPlayer}
        onRetry={() => void retryCover()}
      />

      {isPlaying && recap && !isEmpty && (
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period={period}
          displayName={profile?.name ?? undefined}
          onClose={() => setIsPlaying(false)}
        />
      )}
    </main>
  )
}
