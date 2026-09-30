'use client'

import { Suspense, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import {
  parseWrappedRouteSelection,
  type RecapSharePeriod,
  type WrappedRouteSelection,
} from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useWrapped } from '@/hooks/use-wrapped'
import { WrappedCover } from './_components/wrapped-cover'
import { WrappedPlayer } from './_components/wrapped-player'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'

export default function WrappedPage() {
  return (
    <Suspense fallback={<AppToastHost placement="page" />}>
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
  const playerOpen = isPlaying && recap && !isEmpty

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[900px] flex-col">
      {!playerOpen ? <UpdateAvailableBanner /> : null}
      <div className="flex flex-1 flex-col">
        {!isPlaying ? (
          <AppBar
            title=""
            titleIsHeading={false}
            backLabel={t('common.backToProfile')}
            onBack={() => goBackOrFallback('/profile')}
          />
        ) : null}
        <WrappedCover
          period={period}
          onSelectPeriod={selectPeriod}
          state={coverState}
          onStart={startPlayer}
          onRetry={() => void retryCover()}
        />
      </div>

      {playerOpen && (
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period={period}
          closedMonth={closedMonth}
          onClose={() => setIsPlaying(false)}
          notice={(
            <>
              <UpdateAvailableBanner />
              <div className="px-4"><AppToastHost /></div>
            </>
          )}
        />
      )}
      {!playerOpen ? <AppToastHost placement="page" /> : null}
    </main>
  )
}
