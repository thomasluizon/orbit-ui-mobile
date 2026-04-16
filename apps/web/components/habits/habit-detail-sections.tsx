'use client'
import { BarChart3, Flame, Trophy } from 'lucide-react'
import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'

export type TranslationFn = HabitCardTranslationAdapter

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  t: TranslationFn
}

export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics) {
    return (
      <div>
        <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
            <Flame className="size-5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {t('habits.detail.currentStreak')}
            </span>
            <span className="text-lg font-bold text-text-primary">
              {t('habits.detail.streakDays', {
                n: metrics.currentStreak,
              })}
            </span>
          </div>
          <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
            <Trophy className="size-5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {t('habits.detail.longestStreak')}
            </span>
            <span className="text-lg font-bold text-text-primary">
              {t('habits.detail.streakDays', {
                n: metrics.longestStreak,
              })}
            </span>
          </div>
          <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
            <BarChart3 className="size-5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {t('habits.detail.monthlyRate')}
            </span>
            <span className="text-lg font-bold text-text-primary">
              {Math.round(metrics.monthlyCompletionRate)}%
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (!metrics && loading) {
    return (
      <div>
        <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-2"
            >
              <div className="size-5 rounded-full bg-surface-elevated animate-pulse" />
              <div className="h-2.5 w-10 bg-surface-elevated rounded animate-pulse" />
              <div className="h-5 w-8 bg-surface-elevated rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // metrics is null and not loading
  return (
    <div>
      <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
      <p className="text-sm text-text-muted text-center py-2">
        {t('habits.detail.noDataYet')}
      </p>
    </div>
  )
}

