'use client'

import { useTranslations } from 'next-intl'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { ErrorState } from '@/components/ui/error-state'
import { Icon } from '@/components/ui/icon'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { Button } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  coverEyebrowStyle,
  coverSubtitleStyle,
  coverTitleStyle,
} from './wrapped-styles'

type WrappedCoverState = 'ready' | 'loading' | 'failed' | 'empty'

interface WrappedCoverProps {
  period: RecapSharePeriod
  onSelectPeriod: (period: RecapSharePeriod) => void
  state: WrappedCoverState
  onStart: () => void
  onRetry: () => void
}

export function WrappedCover({
  period,
  onSelectPeriod,
  state,
  onStart,
  onRetry,
}: Readonly<WrappedCoverProps>) {
  const t = useTranslations()

  return (
    <div
      className="flex min-h-dvh flex-col items-start justify-center gap-6 overflow-y-auto px-6 py-8"
      data-state={state}
    >
      <OrbitMark size={96} />

      <div className="flex flex-col gap-2">
        <p style={coverEyebrowStyle}>{t('wrapped.title')}</p>
        <h1 style={coverTitleStyle}>{t(`wrapped.coverTitles.${period}`)}</h1>
        <p style={coverSubtitleStyle}>{t('wrapped.coverSubtitle')}</p>
      </div>

      <div
        role="group"
        aria-label={t('wrapped.periodGroup')}
        className="flex flex-wrap gap-2"
      >
        {RECAP_SHARE_PERIODS.map((value) => (
          <Chip
            key={value}
            active={period === value}
            onClick={() => onSelectPeriod(value)}
            ariaLabel={t(`wrapped.periods.${value}`)}
          >
            {t(`wrapped.periods.${value}`)}
          </Chip>
        ))}
      </div>

      <CoverBody state={state} onStart={onStart} onRetry={onRetry} />
    </div>
  )
}

function CoverBody({
  state,
  onStart,
  onRetry,
}: Readonly<Pick<WrappedCoverProps, 'state' | 'onStart' | 'onRetry'>>) {
  const t = useTranslations()

  if (state === 'loading') {
    return <Skeleton variant="settings" rows={3} label={t('wrapped.loading')} />
  }
  if (state === 'failed') {
    return (
      <div className="w-full">
        <ErrorState
          message={t('wrapped.error')}
          action={<Button size="sm" onClick={onRetry}>{t('wrapped.retry')}</Button>}
        />
      </div>
    )
  }
  if (state === 'empty') {
    return (
      <div className="flex w-full flex-col items-start gap-4 sm:w-auto">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-[var(--r-well)] bg-[var(--bg-well)] text-[var(--fg-3)]"
          >
            <Icon name="satellite" size={24} />
          </span>
          <p className="max-w-[34ch] text-sm leading-[1.55] text-[var(--fg-2)]">
            {t('wrapped.empty')}
          </p>
        </div>
        <div className="w-full [&>button]:w-full">
          <Button disabled>{t('wrapped.start')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full sm:w-auto [&>button]:w-full">
      <Button onClick={onStart}>{t('wrapped.start')}</Button>
    </div>
  )
}
