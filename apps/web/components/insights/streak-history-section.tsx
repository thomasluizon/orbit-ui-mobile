'use client'

import { useTranslations } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { useStreakHistory } from '@/hooks/use-streak-history'
import { InsightsSection, toSectionStatus } from './insights-section'
import type { DateRange } from './range'

interface StreakHistorySectionProps {
  range: DateRange
  divider?: boolean
}

/** Streak length day by day across the selected range, as a trend line. */
export function StreakHistorySection({ range, divider }: Readonly<StreakHistorySectionProps>) {
  const t = useTranslations()
  const { data, isLoading, isError } = useStreakHistory(range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: point.streak,
  }))
  const isEmpty = (data?.points ?? []).every((point) => point.streak === 0)
  const title = t('insights.sections.streakHistory')

  return (
    <InsightsSection
      title={title}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
    >
      <TrendLine points={points} ariaLabel={title} />
    </InsightsSection>
  )
}
