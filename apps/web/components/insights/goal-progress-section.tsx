'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { TrendLine } from '@/components/charts/trend-line'
import { AppSelect } from '@/components/ui/app-select'
import { useGoals } from '@/hooks/use-goals'
import { useGoalProgressHistory } from '@/hooks/use-goal-progress-history'
import { InsightsSection, toSectionStatus, type SectionStatus } from './insights-section'
import { useDateLabel } from './insights-headline'
import type { DateRange } from './range'

interface GoalProgressSectionProps {
  range: DateRange
  divider?: boolean
}

/** Recorded progress for one goal across the selected range, with a goal picker. */
export function GoalProgressSection({ range, divider }: Readonly<GoalProgressSectionProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const formatLabel = useDateLabel()
  const { data: goalsData, isLoading: goalsLoading } = useGoals()
  const goals = goalsData?.allGoals ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeGoalId = selectedId ?? goals[0]?.id ?? ''
  const { data, isLoading, isError, refetch } = useGoalProgressHistory(activeGoalId, range)

  const points = (data?.points ?? []).map((point) => ({
    label: point.date,
    value: point.value,
  }))
  const hasGoals = goals.length > 0
  const title = t('insights.sections.goalProgress')
  const latestPoint = points[points.length - 1]

  let status: SectionStatus
  if (goalsLoading) {
    status = 'loading'
  } else if (!hasGoals) {
    status = 'empty'
  } else {
    status = toSectionStatus({ isLoading, isError, isEmpty: points.length === 0 })
  }

  const picker = hasGoals ? (
    <div className="w-44">
      <AppSelect
        value={activeGoalId}
        onChange={setSelectedId}
        options={goals.map((goal) => ({ value: goal.id, label: goal.title }))}
        label={t('insights.sections.selectGoal')}
      />
    </div>
  ) : null

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.goalProgressDesc')}
      divider={divider}
      status={status}
      onRetry={() => void refetch()}
      headerAction={picker}
      emptyLabel={
        hasGoals ? t('insights.sections.goalProgressEmpty') : t('insights.sections.noGoals')
      }
    >
      <TrendLine
        points={points}
        ariaLabel={latestPoint ? `${title}: ${latestPoint.value.toLocaleString(locale)}` : title}
        formatValue={(value) => value.toLocaleString(locale)}
        formatLabel={formatLabel}
      />
    </InsightsSection>
  )
}
