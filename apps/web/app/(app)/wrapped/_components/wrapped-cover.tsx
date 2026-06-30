'use client'

import { Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'

interface WrappedCoverProps {
  period: RecapSharePeriod
  onSelectPeriod: (period: RecapSharePeriod) => void
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  canStart: boolean
  onStart: () => void
  onRetry: () => void
}

/** Wrapped entry screen: period picker, Start CTA, and the loading / empty / error states before the player opens. */
export function WrappedCover({
  period,
  onSelectPeriod,
  isLoading,
  isError,
  isEmpty,
  canStart,
  onStart,
  onRetry,
}: Readonly<WrappedCoverProps>) {
  const t = useTranslations()

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center text-center"
      style={{ gap: 22, padding: '0 28px 32px' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: 240, background: 'var(--gradient-header)' }}
      />

      <div className="flex flex-col items-center" style={{ gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-3)',
          }}
        >
          {t('wrapped.coverEyebrow')}
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--fg-1)',
          }}
        >
          {t('wrapped.title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-3)',
            maxWidth: 300,
          }}
        >
          {t('wrapped.coverSubtitle')}
        </p>
      </div>

      <div className="flex items-center justify-center" style={{ gap: 8, flexWrap: 'wrap' }}>
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

      <div className="flex flex-col items-center" style={{ gap: 12, minHeight: 84 }}>
        <PillButton
          disabled={!canStart}
          onClick={onStart}
          leading={<Play size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
        >
          {t('wrapped.start')}
        </PillButton>

        {isLoading && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
            {t('wrapped.loading')}
          </p>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center" style={{ gap: 8 }}>
            <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--status-bad)' }}>
              {t('wrapped.error')}
            </p>
            <button type="button" className="chip" onClick={onRetry}>
              {t('wrapped.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && isEmpty && (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)', maxWidth: 300 }}>
            {t('wrapped.empty')}
          </p>
        )}
      </div>
    </div>
  )
}
