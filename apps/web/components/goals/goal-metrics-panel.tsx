'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { SkeletonLine } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

/** Metrics: status row, a StatTile pair (projection + pace), and adherence rows. */
export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
  isStreak = false,
}: Readonly<GoalMetricsPanelProps>) {
  const t = useTranslations()
  const locale = useLocale()

  const statusConfig = useMemo(() => {
    const presentation = getGoalMetricsStatusPresentation(metrics?.trackingStatus)
    if (!presentation) return null

    let dotColor = 'var(--fg-3)'
    if (presentation.tone === 'success') dotColor = 'var(--primary)'
    else if (presentation.tone === 'warning') dotColor = 'var(--status-overdue)'
    else if (presentation.tone === 'danger') dotColor = 'var(--status-bad)'

    return {
      label: t(presentation.labelKey),
      dot: dotColor,
    }
  }, [metrics?.trackingStatus, t])

  if (isLoading) {
    return (
      <div>
        <SectionLabel>{t('goals.metrics.title')}</SectionLabel>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <SkeletonLine width="w-[120px]" height="h-3.5" />
          </div>
        ))}
      </div>
    )
  }

  if (!metrics) return null

  const projectedValue = metrics.projectedCompletionDate
    ? formatGoalMetricsDate(metrics.projectedCompletionDate, locale)
    : t('goals.metrics.noData')

  const paceTile = isStreak
    ? {
        value: metrics.daysToDeadline ?? t('goals.metrics.noData'),
        label: t('goals.metrics.daysToDeadline'),
      }
    : {
        value:
          metrics.velocityPerDay > 0
            ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
            : t('goals.metrics.noData'),
        label: t('goals.metrics.velocity'),
      }

  return (
    <div>
      <SectionLabel>{t('goals.metrics.title')}</SectionLabel>

      {statusConfig && (
        <SettingsRow
          label={t('goals.detail.statusLabel')}
          accessory="none"
          leadingDot={statusConfig.dot}
          value={statusConfig.label}
          valueColor="var(--fg-1)"
        />
      )}

      <div className="flex" style={{ gap: 12, padding: '14px 20px 4px' }}>
        <StatTile
          emoji="📅"
          value={projectedValue}
          label={t('goals.metrics.projectedCompletion')}
          phraseValue
        />
        <StatTile
          emoji="⚡"
          value={paceTile.value}
          label={paceTile.label}
          phraseValue={typeof paceTile.value === 'string'}
        />
      </div>

      {metrics.habitAdherence.length > 0 && (
        <>
          <SectionLabel>{t('goals.metrics.habitAdherence')}</SectionLabel>
          {metrics.habitAdherence.map((habit) => {
            const adherenceTone = getGoalHabitAdherenceTone(habit.weeklyCompletionRate)
            const barColor =
              adherenceTone === 'success' || adherenceTone === 'primary'
                ? 'var(--primary)'
                : 'var(--status-overdue)'

            return (
              <div
                key={habit.habitId}
                className="flex items-center"
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--hairline)',
                  gap: 12,
                }}
              >
                <span
                  className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: 'var(--fg-1)',
                  }}
                >
                  {habit.habitTitle}
                </span>
                <ProgressBar
                  className="w-20 shrink-0"
                  progress={Math.min(100, habit.weeklyCompletionRate) / 100}
                  label={habit.habitTitle}
                  color={barColor}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--fg-1)',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 32,
                    textAlign: 'right',
                  }}
                >
                  {Math.round(habit.weeklyCompletionRate)}%
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
