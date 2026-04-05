'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import type { GoalMetrics } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalMetricsPanelProps {
  metrics: GoalMetrics | null
  unit: string
  isLoading: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalMetricsPanel({
  metrics,
  unit,
  isLoading,
}: Readonly<GoalMetricsPanelProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  const statusConfig = useMemo(() => {
    const status = metrics?.trackingStatus
    switch (status) {
      case 'on_track':
        return {
          label: t('goals.metrics.onTrack'),
          bg: 'bg-green-500/10',
          text: 'text-green-400',
          dot: 'bg-green-500',
        }
      case 'at_risk':
        return {
          label: t('goals.metrics.atRisk'),
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          dot: 'bg-amber-500',
        }
      case 'behind':
        return {
          label: t('goals.metrics.behind'),
          bg: 'bg-red-500/10',
          text: 'text-red-400',
          dot: 'bg-red-500',
        }
      case 'no_deadline':
        return {
          label: t('goals.metrics.noDeadline'),
          bg: 'bg-surface-elevated',
          text: 'text-text-secondary',
          dot: 'bg-text-muted',
        }
      default:
        return null
    }
  }, [metrics?.trackingStatus, t])

  function formatMetricDate(dateStr: string) {
    return format(parseISO(dateStr), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateFnsLocale })
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

        {/* Velocity */}
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
      </div>

      {/* Linked Habit Adherence */}
      {metrics.habitAdherence.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2">
            {t('goals.metrics.habitAdherence')}
          </p>
          <div className="space-y-2">
            {metrics.habitAdherence.map((habit) => (
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
                        className={`h-full rounded-full transition-all duration-500 ${
                          (() => {
                            if (habit.weeklyCompletionRate >= 80) return 'bg-green-500'
                            if (habit.weeklyCompletionRate >= 50) return 'bg-primary'
                            return 'bg-amber-500'
                          })()
                        }`}
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
