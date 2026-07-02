'use client'

import { useTranslations, useLocale } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { useXpHistory } from '@/hooks/use-xp-history'
import { InsightsSection, toSectionStatus } from './insights-section'
import { InsightsHeadline, trendHeadline, useDateLabel } from './insights-headline'
import type { DateRange } from './range'

interface XpOverTimeSectionProps {
  range: DateRange
  divider?: boolean
}

/** Cumulative XP earned across the selected range, as a trend line. */
export function XpOverTimeSection({ range, divider }: Readonly<XpOverTimeSectionProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const formatLabel = useDateLabel()
  const { data, isLoading, isError, refetch } = useXpHistory(range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: point.cumulativeXp,
  }))
  const isEmpty = (data?.points ?? []).every((point) => point.cumulativeXp === 0)
  const title = t('insights.sections.xpOverTime')
  const formatXp = (value: number) => `${value.toLocaleString(locale)} XP`
  const headline = trendHeadline(points, formatXp)

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.xpOverTimeDesc')}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
      onRetry={() => void refetch()}
      headerAction={headline ? <InsightsHeadline {...headline} /> : undefined}
    >
      <TrendLine
        points={points}
        ariaLabel={headline ? `${title}: ${headline.value}` : title}
        formatValue={formatXp}
        formatLabel={formatLabel}
      />
    </InsightsSection>
  )
}
