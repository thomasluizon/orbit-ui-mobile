'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { eachDayOfInterval } from 'date-fns'
import { formatAPIDate, parseAPIDate } from '@orbit/shared/utils'
import { MultiMonthHeatmap } from '@/components/charts/multi-month-heatmap'
import { useCalendarRange } from '@/hooks/use-calendar-data'
import { InsightsSection, toSectionStatus } from './insights-section'
import type { DateRange } from './range'

interface MonthlyHeatmapSectionProps {
  range: DateRange
  divider?: boolean
}

/** Per-day completion volume across the selected range, as a contribution grid. */
export function MonthlyHeatmapSection({ range, divider }: Readonly<MonthlyHeatmapSectionProps>) {
  const t = useTranslations()
  const fromDate = useMemo(() => parseAPIDate(range.from), [range.from])
  const toDate = useMemo(() => parseAPIDate(range.to), [range.to])
  const { dayMap, isLoading, error } = useCalendarRange(fromDate, toDate)

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
      divider={divider}
      skeletonHeight={120}
      status={toSectionStatus({ isLoading, isError: Boolean(error), isEmpty })}
    >
      <MultiMonthHeatmap days={days} ariaLabel={title} />
    </InsightsSection>
  )
}
