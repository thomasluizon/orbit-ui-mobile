'use client'

import { Play } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { RingMotif } from '@/components/gamification/ring-motif'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { coverSubtitleStyle, coverTitleStyle } from './wrapped-styles'

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
      className="flex flex-1 flex-col items-center justify-center text-center lg:grid lg:grid-cols-2 lg:content-center lg:items-center lg:text-left"
      style={{ gap: 28, padding: '0 28px 32px' }}
    >
      <RingMotif
        dashed
        ringSize={300}
        eyebrow={t('wrapped.coverEyebrow')}
        anchor={
          <div className="flex flex-col items-center" style={{ gap: 10 }}>
            <h1 style={coverTitleStyle}>{t('wrapped.title')}</h1>
            <p style={coverSubtitleStyle}>{t('wrapped.coverSubtitle')}</p>
          </div>
        }
      />

      <div className="flex flex-col items-center md:items-start" style={{ gap: 22 }}>
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

        <div className="flex flex-col items-center md:items-start" style={{ gap: 12, minHeight: 84 }}>
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
            <div className="flex flex-col items-center md:items-start" style={{ gap: 8 }}>
              <p
                role="alert"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--status-bad-text)' }}
              >
                {t('wrapped.error')}
              </p>
              <button type="button" className="chip" onClick={onRetry}>
                {t('wrapped.retry')}
              </button>
            </div>
          )}

          {!isLoading && !isError && isEmpty && (
            <div className="flex flex-col items-center" style={{ gap: 12 }}>
              <SatelliteGlyph />
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)', maxWidth: 300 }}>
                {t('wrapped.empty')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
