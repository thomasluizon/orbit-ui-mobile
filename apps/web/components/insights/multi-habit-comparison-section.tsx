'use client'

import { useTranslations } from 'next-intl'
import { BarChart } from '@/components/charts/bar-chart'
import { useHabits } from '@/hooks/use-habits'
import { InsightsSection, toSectionStatus } from './insights-section'

const MAX_BARS = 8

/**
 * Compares the top habits by current streak. The habit list exposes no
 * aggregate completion rate, so current streak is the per-habit signal used
 * for the comparison.
 */
export function MultiHabitComparisonSection({ divider }: Readonly<{ divider?: boolean }>) {
  const t = useTranslations()
  const { data, isLoading, isError, refetch } = useHabits({})

  const bars = (data?.topLevelHabits ?? [])
    .map((habit) => ({ label: habit.title, value: habit.currentStreak ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_BARS)
  const isEmpty = bars.length === 0 || bars.every((bar) => bar.value === 0)
  const title = t('insights.sections.multiHabitComparison')

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.multiHabitComparisonDesc')}
      divider={divider}
      status={toSectionStatus({ isLoading, isError, isEmpty })}
      onRetry={() => void refetch()}
    >
      <BarChart
        bars={bars}
        ariaLabel={title}
        formatValue={(value) => t('insights.sections.streakDaysShort', { count: value })}
      />
    </InsightsSection>
  )
}
