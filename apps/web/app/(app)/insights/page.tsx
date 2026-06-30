'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { RangeSelector } from '@/components/insights/range-selector'
import { computeRange, type RangePreset } from '@/components/insights/range'
import { CompletionTrendsSection } from '@/components/insights/completion-trends-section'
import { XpOverTimeSection } from '@/components/insights/xp-over-time-section'
import { StreakHistorySection } from '@/components/insights/streak-history-section'
import { GoalProgressSection } from '@/components/insights/goal-progress-section'
import { MonthlyHeatmapSection } from '@/components/insights/monthly-heatmap-section'
import { AchievementsTimelineSection } from '@/components/insights/achievements-timeline-section'
import { MultiHabitComparisonSection } from '@/components/insights/multi-habit-comparison-section'
import { InsightsLockedState } from '@/components/insights/insights-locked-state'

export default function InsightsPage() {
  const t = useTranslations()
  const { profile, isLoading: profileLoading } = useProfile()
  const [preset, setPreset] = useState<RangePreset>('month')
  const range = useMemo(() => computeRange(preset), [preset])

  const hasProAccess = profile?.hasProAccess ?? false

  if (!profileLoading && !hasProAccess) {
    return <InsightsLockedState />
  }

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex flex-col gap-4 pt-6 pb-2 md:pt-2">
        <div className="flex flex-col gap-1.5 md:hidden">
          <h1 className="t-display text-balance">{t('insights.title')}</h1>
          <p className="t-secondary text-balance">{t('insights.subtitle')}</p>
        </div>
        <RangeSelector value={preset} onChange={setPreset} />
      </header>

      <CompletionTrendsSection range={range} divider={false} />
      <XpOverTimeSection range={range} />
      <StreakHistorySection range={range} />
      <GoalProgressSection range={range} />
      <MonthlyHeatmapSection range={range} />
      <AchievementsTimelineSection />
      <MultiHabitComparisonSection />
    </div>
  )
}
