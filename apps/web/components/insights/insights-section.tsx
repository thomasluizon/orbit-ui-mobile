'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

export type SectionStatus = 'loading' | 'error' | 'empty' | 'ready'

/**
 * Collapses react-query-style flags into a single render state, in priority
 * order: loading, then error, then empty, then ready.
 */
export function toSectionStatus(flags: {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
}): SectionStatus {
  if (flags.isLoading) return 'loading'
  if (flags.isError) return 'error'
  if (flags.isEmpty) return 'empty'
  return 'ready'
}

interface InsightsSectionProps {
  title: string
  status: SectionStatus
  description?: string
  headerAction?: ReactNode
  emptyLabel?: string
  divider?: boolean
  skeletonHeight?: number
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
  skeletonHeight = 160,
  children,
}: Readonly<InsightsSectionProps>) {
  const t = useTranslations()

  return (
    <section className={`py-7 ${divider ? 'border-t border-[var(--hairline)]' : ''}`}>
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
          <p className="t-secondary" style={{ color: 'var(--status-bad-text)' }}>
            {t('insights.error')}
          </p>
        ) : null}
        {status === 'empty' ? (
          <p className="t-secondary">{emptyLabel ?? t('insights.empty')}</p>
        ) : null}
        {status === 'ready' ? children : null}
      </div>
    </section>
  )
}
