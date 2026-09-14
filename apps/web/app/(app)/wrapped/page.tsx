'use client'

import { useState } from 'react'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useWrapped } from '@/hooks/use-wrapped'
import { WrappedCover } from './_components/wrapped-cover'
import { WrappedPlayer } from './_components/wrapped-player'

export default function WrappedPage() {
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
    <main className="flex min-h-dvh flex-col">
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
