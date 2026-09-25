'use client'

import { Suspense, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import {
  parseWrappedRouteSelection,
  type RecapSharePeriod,
  type WrappedRouteSelection,
} from '@orbit/shared/utils'
import { Button } from '@/components/ui/pill-button'
import { ChevronLeft } from '@/components/ui/icons'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useWrapped } from '@/hooks/use-wrapped'
import { WrappedCover } from './_components/wrapped-cover'
import { WrappedPlayer } from './_components/wrapped-player'

export default function WrappedPage() {
  return (
    <Suspense fallback={null}>
      <WrappedPageRoute />
    </Suspense>
  )
}

function WrappedPageRoute() {
  const searchParams = useSearchParams()
  const initialSelection = parseWrappedRouteSelection(
    searchParams.get('period'),
    searchParams.get('year'),
    searchParams.get('month'),
  )
  const routeKey = initialSelection.closedMonth
    ? `${initialSelection.period}:${initialSelection.closedMonth.year}:${initialSelection.closedMonth.month}`
    : initialSelection.period

  return <WrappedPageContent key={routeKey} initialSelection={initialSelection} />
}

function WrappedPageContent({ initialSelection }: Readonly<{
  initialSelection: WrappedRouteSelection
}>) {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const [selection, setSelection] = useState(initialSelection)
  const { period, closedMonth } = selection
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
    closedMonth,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setSelection({ period: next })
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
          onClose={() => setIsPlaying(false)}
        />
      )}
    </main>
  )
}
