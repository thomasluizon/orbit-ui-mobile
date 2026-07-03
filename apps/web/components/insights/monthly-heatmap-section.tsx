'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { eachDayOfInterval } from 'date-fns'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import { MultiMonthHeatmap } from '@/components/charts/multi-month-heatmap'
import { useCalendarRangeChunked } from '@/hooks/use-calendar-data'
import { useProfile } from '@/hooks/use-profile'
import { InsightsSection, toSectionStatus } from './insights-section'
import { useDateLabel } from './insights-headline'
import type { DateRange } from './range'

interface MonthlyHeatmapSectionProps {
  range: DateRange
  divider?: boolean
  className?: string
}

/** Per-day completion volume across the selected range, as a contribution grid. */
export function MonthlyHeatmapSection({
  range,
  divider,
  className,
}: Readonly<MonthlyHeatmapSectionProps>) {
  const t = useTranslations()
  const formatLabel = useDateLabel()
  const { profile } = useProfile()
  const fromDate = useMemo(() => parseAPIDate(range.from), [range.from])
  const toDate = useMemo(() => parseAPIDate(range.to), [range.to])
  const { dayMap, isLoading, error, refresh } = useCalendarRangeChunked(fromDate, toDate)

  const days = useMemo(
    () =>
      eachDayOfInterval({ start: fromDate, end: toDate }).map((date) => {
        const key = formatAPIDate(date)
        const entries = dayMap.get(key) ?? []
        return {
          date: key,
          value: entries.filter((entry) => entry.status === 'completed').length,
        }
      }),
    [dayMap, fromDate, toDate],
  )

  const isEmpty = days.every((day) => day.value === 0)
  const title = t('insights.sections.monthlyHeatmap')

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.monthlyHeatmapDesc')}
      divider={divider}
      className={className}
      skeletonHeight={120}
      status={toSectionStatus({ isLoading, isError: Boolean(error), isEmpty })}
      onRetry={refresh}
    >
      <MultiMonthHeatmap
        days={days}
        ariaLabel={title}
        weekStartsOn={profile?.weekStartDay ?? 0}
        cellTitle={(date, value) =>
          t('insights.sections.heatmapCell', { date: formatLabel(date), count: value })
        }
        legend={{
          less: t('insights.sections.heatmapLess'),
          more: t('insights.sections.heatmapMore'),
        }}
      />
    </InsightsSection>
  )
}
