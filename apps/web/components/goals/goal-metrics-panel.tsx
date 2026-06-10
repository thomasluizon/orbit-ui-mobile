'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

/** Metrics: status row + flush SettingsRow strip + adherence rows.
 *  No chrome cards — purely hairline-separated rows. */
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

  function formatMetricDate(dateStr: string) {
    return formatGoalMetricsDate(dateStr, locale)
  }

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
            <div
              className="animate-pulse rounded"
              style={{ height: 14, width: 120, background: 'var(--bg-elev)' }}
            />
          </div>
        ))}
      </div>
    )
  }

  if (!metrics) return null

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

      <SettingsRow
        label={t('goals.metrics.projectedCompletion')}
        mono
        accessory="none"
        value={
          metrics.projectedCompletionDate
            ? formatMetricDate(metrics.projectedCompletionDate)
            : t('goals.metrics.noData')
        }
        valueColor="var(--fg-1)"
      />

      {isStreak ? (
        <SettingsRow
          label={t('goals.streak.daysRemaining', { count: metrics.daysToDeadline ?? 0 })}
          mono
          accessory="none"
          value={metrics.daysToDeadline ?? t('goals.metrics.noData')}
          valueColor="var(--fg-1)"
        />
      ) : (
        <SettingsRow
          label={t('goals.metrics.velocity')}
          mono
          accessory="none"
          value={
            metrics.velocityPerDay > 0
              ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
              : t('goals.metrics.noData')
          }
          valueColor="var(--fg-1)"
        />
      )}

      {metrics.habitAdherence.length > 0 && (
        <>
          <SectionLabel>{t('goals.metrics.habitAdherence')}</SectionLabel>
          {metrics.habitAdherence.map((habit) => {
            const adherenceTone = getGoalHabitAdherenceTone(habit.weeklyCompletionRate)
            let barColor = 'var(--status-overdue)'
            if (adherenceTone === 'success') {
              barColor = 'var(--primary)'
            } else if (adherenceTone === 'primary') {
              barColor = 'var(--primary)'
            }

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
                <div
                  className="relative rounded-full"
                  style={{
                    width: 80,
                    height: 3,
                    background: 'var(--bg-sunk)',
                  }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-full"
                    style={{
                      width: `${Math.min(100, habit.weeklyCompletionRate)}%`,
                      background: barColor,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--fg-1)',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 28,
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
