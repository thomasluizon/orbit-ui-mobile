'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useTopbarSlot, useTopbarHeading } from '@/components/shell/topbar-slot'
import { AppBar } from '@/components/ui/app-bar'
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
  const goBackOrFallback = useGoBackOrFallback()
  const isDesktop = useIsDesktop()
  const [preset, setPreset] = useState<RangePreset>('month')
  const range = useMemo(() => computeRange(preset), [preset])

  const hasProAccess = profile?.hasProAccess ?? false

  const topbarRangeSelector = useMemo(
    () =>
      isDesktop && hasProAccess ? <RangeSelector value={preset} onChange={setPreset} /> : null,
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess is derived from profile.hasProAccess every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [isDesktop, hasProAccess, preset],
  )
  useTopbarSlot(topbarRangeSelector)
  useTopbarHeading({ ownedByPage: true })

  const phoneBackBar = (
    <div className="md:hidden">
      <AppBar back backLabel={t('common.goBack')} onBack={() => goBackOrFallback('/')} />
    </div>
  )

  if (!profileLoading && !hasProAccess) {
    return (
      <>
        {phoneBackBar}
        <InsightsLockedState />
      </>
    )
  }

  return (
    <div className="stagger-enter min-h-dvh pb-10">
      {phoneBackBar}
      <header className="flex flex-col gap-4 pt-6 pb-2">
        <div className="flex flex-col gap-1.5">
          <h1 className="t-display text-balance">{t('insights.title')}</h1>
          <p className="t-secondary text-balance">{t('insights.subtitle')}</p>
        </div>
        <div className="md:hidden">
          <RangeSelector value={preset} onChange={setPreset} />
        </div>
      </header>

      <CompletionTrendsSection range={range} divider={false} />
      <XpOverTimeSection range={range} />
      <StreakHistorySection range={range} />
      <GoalProgressSection range={range} />
      <MultiHabitComparisonSection />
      <MonthlyHeatmapSection range={range} />
      <AchievementsTimelineSection />
    </div>
  )
}
