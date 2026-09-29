'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { getClosedMonthFromWrappedParams, type ClosedMonth, type RecapSharePeriod } from '@orbit/shared/utils'
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
  const searchParams = useSearchParams()
  const [selection, setSelection] = useState<{ period: RecapSharePeriod; closedMonth: ClosedMonth | null }>(() => {
    const closedMonth = getClosedMonthFromWrappedParams({
      wrapped: searchParams.get('wrapped'),
      year: searchParams.get('year'),
      month: searchParams.get('month'),
    })
    const period: RecapSharePeriod = closedMonth ? 'month' : 'week'
    return { period, closedMonth }
  })
  const { period, closedMonth } = selection
  const [isPlaying, setIsPlaying] = useState(false)
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
    closedMonth,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setSelection({ period: next, closedMonth: null })
    setIsPlaying(false)
  }

  return (
    <div className="flex flex-col min-h-[100dvh] md:min-h-0">
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
