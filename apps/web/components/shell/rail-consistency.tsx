'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { subDays } from 'date-fns'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import { useToday } from '@/app/(app)/today-provider'
import { useHabitTrends } from '@/hooks/use-habit-trends'
import { computeRange } from '@/components/insights/range'

const CHART_HEIGHT = 36
const EMPTY_BAR_HEIGHT = 3
const DAYS = 7

/**
 * The last seven days of habit completion as a static mini bar chart, one bar per day.
 * Paint-only by design: this is data the user reads, so the bars never animate.
 */
export function RailConsistency() {
  const t = useTranslations()
  const today = useToday()
  const range = useMemo(() => computeRange('week', parseAPIDate(today)), [today])
  const trends = useHabitTrends(range)

  const end = parseAPIDate(range.to)
  const rateByDate = new Map((trends.data?.points ?? []).map((point) => [point.date, point.completionRate]))
  const days = Array.from({ length: DAYS }, (_, index) => {
    const date = formatAPIDate(subDays(end, DAYS - 1 - index))
    return { date, rate: rateByDate.get(date) ?? 0 }
  })

  if (!trends.isSuccess || trends.data.activeHabitCount === 0) return null

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)' }}>
        {t('rail.consistency')}
      </span>
      <div
        role="img"
        aria-label={t('rail.consistencyAria')}
        className="flex items-end"
        style={{ gap: 4, height: CHART_HEIGHT }}
      >
        {days.map((day) => {
          const active = day.rate > 0
          const height = active
            ? Math.max(Math.round((day.rate / 100) * CHART_HEIGHT), 6)
            : EMPTY_BAR_HEIGHT
          return (
            <span
              key={day.date}
              aria-hidden="true"
              data-consistency-bar=""
              data-rate={Math.round(day.rate)}
              className="flex-1 rounded-[3px]"
              style={{ height, background: active ? 'var(--primary)' : 'var(--bg-well)' }}
            />
          )
        })}
      </div>
    </div>
  )
}
