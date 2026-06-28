'use client'

import { useTranslations } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { useXpHistory } from '@/hooks/use-xp-history'
import { InsightsSection, toSectionStatus } from './insights-section'
import type { DateRange } from './range'

interface XpOverTimeSectionProps {
  range: DateRange
  divider?: boolean
}

/** Cumulative XP earned across the selected range, as a trend line. */
export function XpOverTimeSection({ range, divider }: Readonly<XpOverTimeSectionProps>) {
  const t = useTranslations()
  const { data, isLoading, isError } = useXpHistory(range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: point.cumulativeXp,
  }))
  const isEmpty = (data?.points ?? []).every((point) => point.cumulativeXp === 0)
  const title = t('insights.sections.xpOverTime')

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.xpOverTimeDesc')}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
    >
      <TrendLine points={points} ariaLabel={title} />
    </InsightsSection>
  )
}
