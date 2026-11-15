'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  parseWrappedRouteSelection,
  type RecapSharePeriod,
  type WrappedRouteSelection,
} from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { useBackLabel } from '@/hooks/use-back-label'
import { useFlag } from '@/hooks/use-flag'
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

function resolveCoverState({ isLoading, isError, isEmpty, hasRecap }: Readonly<{ isLoading: boolean; isError: boolean; isEmpty: boolean; hasRecap: boolean }>) {
  if (isLoading) return 'loading'
  if (isError) return 'failed'
  if (isEmpty) return 'empty'
  return hasRecap ? 'ready' : 'loading'
}

function WrappedPageContent({ initialSelection }: Readonly<{
  initialSelection: WrappedRouteSelection
}>) {
  const goBackOrFallback = useGoBackOrFallback()
  const backLabel = useBackLabel('/profile')
  const guided = useFlag('orbit_guided_flows')
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

  const coverState = resolveCoverState({ isLoading: isLoading || isRetrying, isError, isEmpty, hasRecap: Boolean(recap) })
  const playerOpen = isPlaying && recap && !isEmpty

  return (
    <main className={`mx-auto flex w-full max-w-[900px] flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] ${guided ? 'h-dvh' : 'min-h-dvh'}`}>
      {!playerOpen ? <UpdateAvailableBanner /> : null}
      <div className={guided ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}>
        {!playerOpen ? (
          <AppBar
            title=""
            titleIsHeading={false}
            backLabel={backLabel}
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
              <UpdateAvailableBanner inset="inline" />
              <div className="px-4 pt-3 empty:hidden"><AppToastHost /></div>
            </>
          )}
        />
      )}
      {!playerOpen ? <AppToastHost placement="page" /> : null}
    </main>
  )
}
