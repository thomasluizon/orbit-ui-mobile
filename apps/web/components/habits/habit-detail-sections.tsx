import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { StatTile } from '@/components/ui/stat-tile'

export type TranslationFn = HabitCardTranslationAdapter

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  isBadHabit?: boolean
  t: TranslationFn
}

/** Kit StatTile row for the habit detail: streak, longest streak, monthly rate. */
export function HabitDetailStatsGrid({
  metrics,
  loading,
  isBadHabit = false,
  t,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics) {
    return (
      <div>
        <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
        <div className="flex" style={{ gap: 12, padding: '0 20px 12px' }}>
          <StatTile
            emoji={isBadHabit ? '🛡️' : '🔥'}
            value={String(metrics.currentStreak)}
            label={
              isBadHabit
                ? t('habits.detail.daysFree')
                : t('habits.detail.currentStreak')
            }
          />
          <StatTile
            emoji="🏆"
            value={String(metrics.longestStreak)}
            label={t('habits.detail.longestStreak')}
          />
          <StatTile
            emoji="📈"
            value={`${Math.round(metrics.monthlyCompletionRate)}%`}
            label={t('habits.detail.monthlyRate')}
          />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
        <div className="flex" style={{ gap: 12, padding: '0 20px 12px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-1 animate-pulse"
              style={{
                height: 110,
                borderRadius: 18,
                background: 'var(--bg-field)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel>{t('habits.detail.stats')}</SectionLabel>
      <p
        className="text-center"
        style={{
          padding: '14px 20px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-3)',
        }}
      >
        {t('habits.detail.noDataYet')}
      </p>
    </div>
  )
}
