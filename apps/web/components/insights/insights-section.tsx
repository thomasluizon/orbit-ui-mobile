'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { SectionStatus } from './insights-section-status'

interface InsightsSectionProps {
  title: string
  status: SectionStatus
  description?: string
  headerAction?: ReactNode
  emptyLabel?: string
  divider?: boolean
  skeletonHeight?: number
  className?: string
  onRetry?: () => void
  children: ReactNode
}

/**
 * Chrome for one insights block: a heading row with an optional control, then a
 * body that swaps between skeleton, error, empty, and the chart per `status`.
 * Blocks are separated by a hairline rule and negative space, never stacked as
 * cards.
 */
export function InsightsSection({
  title,
  status,
  description,
  headerAction,
  emptyLabel,
  divider = true,
  skeletonHeight = 188,
  className,
  onRetry,
  children,
}: Readonly<InsightsSectionProps>) {
  const t = useTranslations()

  return (
    <section
      className={`py-7 ${divider ? 'border-t border-[var(--hairline)]' : ''} ${className ?? ''}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="t-h2 text-balance">{title}</h2>
          {description ? <p className="t-secondary text-balance">{description}</p> : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      <div aria-busy={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <span className="sr-only">{t('insights.loading')}</span>
            <div
              className="skeleton-pulse rounded-[16px]"
              style={{ height: skeletonHeight, background: 'var(--bg-elev)' }}
            />
          </>
        ) : null}
        {status === 'error' ? (
          <div className="flex items-center gap-3">
            <p className="t-secondary" style={{ color: 'var(--status-bad-text)' }}>
              {t('insights.error')}
            </p>
            {onRetry ? (
              <button type="button" className="chip min-h-[44px]" onClick={onRetry}>
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {status === 'empty' ? (
          <p className="t-secondary">{emptyLabel ?? t('insights.empty')}</p>
        ) : null}
        {status === 'ready' ? <div className="animate-slide-up">{children}</div> : null}
      </div>
    </section>
  )
}
