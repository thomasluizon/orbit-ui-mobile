'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { TrendingDown, TrendingUp } from '@/components/ui/icons'
import { parseAPIDate } from '@orbit/shared/utils'
import type { InsightsHeadlineProps } from './insights-headline-model'

/**
 * Compact "where you are now" stat for a trend section header: the latest value
 * plus a small change chip versus the start of the range, so the chart below
 * reads as the supporting detail rather than the only number on screen.
 */
export function InsightsHeadline({
  value,
  delta,
  direction,
  caption,
}: Readonly<InsightsHeadlineProps>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="t-num" style={{ fontSize: 22, lineHeight: 1.1, color: 'var(--fg-1)' }}>
        {value}
      </span>
      {caption ? <span className="t-meta">{caption}</span> : null}
      {delta && direction ? (
        <span
          className="t-meta inline-flex items-center gap-1"
          style={{ color: direction === 'up' ? 'var(--primary)' : 'var(--fg-3)' }}
        >
          <span className="sr-only">
            {t(direction === 'up' ? 'insights.trendUp' : 'insights.trendDown')}
          </span>
          {direction === 'up' ? (
            <TrendingUp size={13} strokeWidth={2} aria-hidden />
          ) : (
            <TrendingDown size={13} strokeWidth={2} aria-hidden />
          )}
          {delta}
        </span>
      ) : null}
    </div>
  )
}

/** Stable short month-day formatter for ISO API dates in the active locale. */
export function useDateLabel(): (isoDate: string) => string {
  const locale = useLocale()
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    return (isoDate: string) => formatter.format(parseAPIDate(isoDate))
  }, [locale])
}
