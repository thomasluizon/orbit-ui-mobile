'use client'

import { useTranslations } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { useHabitTrends } from '@/hooks/use-habit-trends'
import { InsightsSection, toSectionStatus } from './insights-section'
import type { DateRange } from './range'

interface CompletionTrendsSectionProps {
  range: DateRange
  divider?: boolean
}

/** Daily share of habits completed across the selected range, as a trend line. */
export function CompletionTrendsSection({
  range,
  divider,
}: Readonly<CompletionTrendsSectionProps>) {
  const t = useTranslations()
  const { data, isLoading, isError } = useHabitTrends(range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: Math.round(point.completionRate),
  }))
  const isEmpty = (data?.points ?? []).every((point) => point.completedCount === 0)
  const title = t('insights.sections.completionTrends')

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.completionTrendsDesc')}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
    >
      <TrendLine points={points} ariaLabel={title} />
    </InsightsSection>
  )
}
