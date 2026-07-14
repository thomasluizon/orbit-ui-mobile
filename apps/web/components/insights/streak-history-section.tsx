'use client'

import { useTranslations } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { plural } from '@/lib/plural'
import { useStreakHistory } from '@/hooks/use-streak-history'
import { InsightsSection } from './insights-section'
import { toSectionStatus } from './insights-section-status'
import { InsightsHeadline, useDateLabel } from './insights-headline'
import { trendHeadline } from './insights-headline-model'
import type { DateRange } from './range'

interface StreakHistorySectionProps {
  range: DateRange
  divider?: boolean
}

/** Streak length day by day across the selected range, as a trend line. */
export function StreakHistorySection({ range, divider }: Readonly<StreakHistorySectionProps>) {
  const t = useTranslations()
  const formatLabel = useDateLabel()
  const { data, isLoading, isError, refetch } = useStreakHistory(range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: point.streak,
  }))
  const isEmpty = (data?.points ?? []).every((point) => point.streak === 0)
  const title = t('insights.sections.streakHistory')
  const formatDays = (value: number) => `${value} ${plural(t('streakDisplay.daysSuffix'), value)}`
  const headline = trendHeadline(points, formatDays)

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.streakHistoryDesc')}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
      onRetry={() => void refetch()}
      headerAction={headline ? <InsightsHeadline {...headline} /> : undefined}
    >
      <TrendLine
        points={points}
        ariaLabel={headline ? `${title}: ${headline.value}` : title}
        formatValue={formatDays}
        formatLabel={formatLabel}
      />
    </InsightsSection>
  )
}
