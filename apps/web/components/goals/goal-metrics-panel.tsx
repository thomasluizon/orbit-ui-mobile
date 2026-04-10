'use client'

import { useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { GoalMetricsViewModel } from '@orbit/shared/utils/goal-metrics'
import {
  formatGoalMetricsDate,
  getGoalHabitAdherenceTone,
  getGoalMetricsStatusPresentation,
} from '@orbit/shared/utils/goal-metrics'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalMetricsPanelProps {
  metrics: GoalMetricsViewModel | null
  unit: string
  isLoading: boolean
  isStreak?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

    switch (presentation.tone) {
      case 'success':
        return {
          label: t(presentation.labelKey),
          bg: 'bg-green-500/10',
          text: 'text-green-400',
          dot: 'bg-green-500',
        }
      case 'warning':
        return {
          label: t(presentation.labelKey),
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          dot: 'bg-amber-500',
        }
      case 'danger':
        return {
          label: t(presentation.labelKey),
          bg: 'bg-red-500/10',
          text: 'text-red-400',
          dot: 'bg-red-500',
        }
      case 'muted':
        return {
          label: t(presentation.labelKey),
          bg: 'bg-surface-elevated',
          text: 'text-text-secondary',
          dot: 'bg-text-muted',
        }
      default:
        return null
    }
  }, [metrics?.trackingStatus, t])

  function formatMetricDate(dateStr: string) {
    return formatGoalMetricsDate(dateStr, locale)
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <div className="h-8 bg-surface-elevated rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-surface-elevated rounded-xl animate-pulse" />
          <div className="h-16 bg-surface-elevated rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (!metrics) return null

  return (
    <div className="space-y-4 py-4">
      {/* Tracking Status Badge */}
      {statusConfig && (
        <div
          className={`${statusConfig.bg} flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-lg)] border border-border-muted`}
        >
          <div className={`${statusConfig.dot} w-2 h-2 rounded-full`} />
          <span className={`${statusConfig.text} text-sm font-semibold`}>
            {statusConfig.label}
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Projected Completion */}
        <div className="bg-surface-elevated rounded-[var(--radius-lg)] px-4 py-3 border border-border-muted shadow-[var(--shadow-sm)]">
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">
            {t('goals.metrics.projectedCompletion')}
          </p>
          <p className="text-sm font-semibold text-text-primary mt-1">
            {metrics.projectedCompletionDate
              ? formatMetricDate(metrics.projectedCompletionDate)
              : t('goals.metrics.noData')}
          </p>
        </div>

        {/* Streak goals: show days remaining; standard goals: show velocity */}
        {isStreak && metrics.daysToDeadline != null ? (
          <div className="bg-orange-500/10 rounded-[var(--radius-lg)] px-4 py-3 border border-orange-500/20 shadow-[var(--shadow-sm)]">
            <p className="text-[10px] uppercase tracking-wider text-orange-400 font-bold">
              {t('goals.streak.daysRemaining', { count: metrics.daysToDeadline })}
            </p>
            <p className="text-sm font-semibold text-orange-300 mt-1">
              {metrics.daysToDeadline}
            </p>
          </div>
        ) : (
          <div className="bg-surface-elevated rounded-[var(--radius-lg)] px-4 py-3 border border-border-muted shadow-[var(--shadow-sm)]">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">
              {t('goals.metrics.velocity')}
            </p>
            <p className="text-sm font-semibold text-text-primary mt-1">
              {metrics.velocityPerDay > 0
                ? `${metrics.velocityPerDay} ${unit}/${t('goals.metrics.perDay')}`
                : t('goals.metrics.noData')}
            </p>
          </div>
        )}
      </div>

      {/* Linked Habit Adherence */}
      {metrics.habitAdherence.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">
            {t('goals.metrics.habitAdherence')}
          </p>
          <div className="space-y-2">
            {metrics.habitAdherence.map((habit) => {
              const adherenceTone = getGoalHabitAdherenceTone(
                habit.weeklyCompletionRate,
              )
              let barColor = 'bg-amber-500'
              if (adherenceTone === 'success') {
                barColor = 'bg-green-500'
              } else if (adherenceTone === 'primary') {
                barColor = 'bg-primary'
              }

              return (
                <div
                  key={habit.habitId}
                  className="bg-surface-elevated rounded-[var(--radius-lg)] px-4 py-3 flex items-center justify-between border border-border-muted shadow-[var(--shadow-sm)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {habit.habitTitle}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{
                            width: `${Math.min(100, habit.weeklyCompletionRate)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted font-semibold whitespace-nowrap">
                        {Math.round(habit.weeklyCompletionRate)}%
                      </span>
                    </div>
                  </div>
                  {habit.currentStreak > 0 && (
                    <div className="ml-3 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold whitespace-nowrap">
                      {t('habits.detail.streakDays', { n: habit.currentStreak })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
