'use client'

import { useEffect, useId, useRef } from 'react'
import { animate } from 'motion/react'
import { useTranslations } from 'next-intl'
import { motionDurations } from '@orbit/shared/theme'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Button } from '@/components/ui/pill-button'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import type { WrappedCoverProps } from './wrapped-cover'
import { coverEyebrowStyle } from './wrapped-styles'

const COVER_LINE_KEYS = {
  ready: 'wrapped.coverSubtitle',
  loading: 'wrapped.coverSubtitle',
  empty: 'wrapped.empty',
  failed: 'wrapped.error',
} as const

/** The title and the line fade in when the person picks another period. The first paint and reduced motion are still. */
function usePeriodFade(period: RecapSharePeriod, reducedMotion: boolean) {
  const groupRef = useRef<HTMLDivElement>(null)
  const shownPeriod = useRef(period)
  useEffect(() => {
    if (shownPeriod.current === period) return undefined
    shownPeriod.current = period
    if (reducedMotion || !groupRef.current) return undefined
    const fade = animate(groupRef.current, { opacity: [0, 1] }, { duration: motionDurations.micro / 1000 })
    return () => fade.stop()
  }, [period, reducedMotion])
  return groupRef
}

function StartAction({ wide, loading, onStart }: Readonly<{ wide: boolean; loading: boolean; onStart: () => void }>) {
  const t = useTranslations()
  return (
    <div data-wrapped-cover-primary="" className={wide ? 'flex w-full justify-center' : 'mx-auto w-full max-w-[592px] px-4 pb-4 pt-2'}>
      <div className={wide ? 'w-full max-w-[360px]' : 'w-full'}>
        <Button loading={loading} focusableWhenLoading onClick={onStart}>{t('wrapped.start')}</Button>
      </div>
    </div>
  )
}

/** The Wrapped cover under `orbit_guided_flows`: Orbit, the title of the period, the Orbit line and the period question in one centred block. */
export function GuidedWrappedCover({ period, onSelectPeriod, state, onStart, onRetry }: Readonly<WrappedCoverProps>) {
  const t = useTranslations()
  const wide = useViewportMatch('(min-width: 1024px)')
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const questionId = useId()
  const lineId = useId()
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const groupRef = usePeriodFade(period, reducedMotion)
  const line = t(COVER_LINE_KEYS[state])
  const announcement = useFlowAnnouncement(line, 'cover')
  const start = state === 'ready' || state === 'loading'
    ? <StartAction wide={wide} loading={state === 'loading'} onStart={onStart} />
    : null

  return (
    <div data-state={state} data-wrapped-cover="guided" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4">
        <div
          data-wrapped-cover-block=""
          onFocusCapture={(event) => lookTowards(event.target)}
          onBlurCapture={lookAway}
          className="my-auto flex w-full max-w-[592px] flex-col items-center gap-6 py-4 text-center"
        >
          <span ref={mascotRef} aria-hidden="true"><OrbitMascot size={wide ? 128 : 96} state="parado" lookAt={lookAt} turnKey={period} /></span>
          <div ref={groupRef} data-period-fade={reducedMotion ? motionDurations.instant : motionDurations.micro} className="flex flex-col items-center gap-3">
            <p style={coverEyebrowStyle}>{t('wrapped.title')}</p>
            <h1 aria-describedby={lineId} className="t-display-heading text-balance">{t(`wrapped.coverTitles.${period}`)}</h1>
            <p id={lineId} data-wrapped-orbit-line="" role={state === 'failed' ? 'alert' : undefined} className="max-w-[40ch] text-pretty text-base leading-6 text-[var(--fg-2)]">{line}</p>
            {state === 'failed' ? <IconButton label={t('wrapped.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
          </div>
          <div className="flex w-full flex-col gap-3">
            <h2 id={questionId} className="text-balance text-[17px] font-medium leading-6 text-[var(--fg-1)]">{t('wrapped.periodQuestion')}</h2>
            <div role="group" aria-labelledby={questionId} data-option-group="" className="grid w-full grid-cols-2 gap-3">
              {RECAP_SHARE_PERIODS.map((value) => (
                <OptionCard key={value} label={t(`wrapped.periods.${value}`)} selected={period === value} onSelect={() => onSelectPeriod(value)} />
              ))}
            </div>
          </div>
          {wide ? start : null}
        </div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">{state === 'loading' ? t('wrapped.loading') : announcement}</span>
      {wide ? null : start}
    </div>
  )
}
