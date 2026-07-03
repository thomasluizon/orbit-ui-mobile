'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { parseAPIDate } from '@orbit/shared/utils'

interface InsightsHeadlineProps {
  /** The latest value, already formatted with its unit. */
  value: string
  /** The change versus the start of the range, already formatted (absolute). */
  delta?: string
  direction?: 'up' | 'down'
  /** Optional qualifier rendered as a meta line under the value (e.g. "avg"). */
  caption?: string
}

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
    <div className="flex flex-col items-end gap-0.5">
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

/**
 * Derives the latest value and the change versus the first point of a series,
 * each pre-formatted, for an {@link InsightsHeadline}. Returns null for an empty
 * series and omits the delta when it is flat or there is a single point.
 */
export function trendHeadline(
  points: ReadonlyArray<{ value: number }>,
  formatValue: (value: number) => string,
): InsightsHeadlineProps | null {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return null
  const diff = last.value - first.value
  if (points.length < 2 || diff === 0) {
    return { value: formatValue(last.value) }
  }
  return {
    value: formatValue(last.value),
    delta: formatValue(Math.abs(diff)),
    direction: diff > 0 ? 'up' : 'down',
  }
}

/** Stable short month-day formatter for ISO API dates in the active locale. */
export function useDateLabel(): (isoDate: string) => string {
  const locale = useLocale()
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    return (isoDate: string) => formatter.format(parseAPIDate(isoDate))
  }, [locale])
}
