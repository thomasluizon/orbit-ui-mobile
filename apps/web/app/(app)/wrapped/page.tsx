'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
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
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setPeriod(next)
    setIsPlaying(false)
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar back backLabel={t('wrapped.back')} onBack={() => goBackOrFallback('/profile')} />

      <WrappedCover
        period={period}
        onSelectPeriod={selectPeriod}
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        canStart={!!recap && !isEmpty}
        onStart={() => setIsPlaying(true)}
        onRetry={() => void refetch()}
      />

      {isPlaying && recap && (
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period={period}
          displayName={profile?.name ?? undefined}
          onClose={() => setIsPlaying(false)}
        />
      )}
    </div>
  )
}
