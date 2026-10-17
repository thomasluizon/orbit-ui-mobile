'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { GoalMetrics } from '@orbit/shared/types/goal'
import { formatGoalHistoryNumber, formatGoalMetricsDate } from '@orbit/shared/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface GoalMetricsPanelProps {
  metrics: GoalMetrics | null
  unit: string
  isLoading: boolean
}

export function GoalMetricsPanel({ metrics, unit, isLoading }: Readonly<GoalMetricsPanelProps>) {
  const t = useTranslations()
  const locale = useLocale()
  if (isLoading) return <GoalMetricsSkeleton label={t('goals.metrics.title')} />
  if (!metrics) return null

  const figures = [
    { key: 'daysToDeadline', label: t('goals.metrics.daysToDeadline'), value: metrics.daysToDeadline === null ? t('goals.metrics.noDeadline') : formatGoalHistoryNumber(metrics.daysToDeadline, locale) },
    { key: 'velocity', label: t('goals.metrics.velocity'), value: metrics.velocityPerDay > 0 ? t('goals.metrics.dailyPace', { value: formatGoalHistoryNumber(metrics.velocityPerDay, locale), unit }) : t('goals.metrics.noData') },
    { key: 'projectedCompletion', label: t('goals.metrics.projectedCompletion'), value: metrics.projectedCompletionDate ? formatGoalMetricsDate(metrics.projectedCompletionDate, locale) : t('goals.metrics.noData') },
  ]

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-[20px] font-medium text-[var(--fg-1)]" style={{ lineHeight: 1.2 }}>{t('goals.metrics.title')}</h2>
      <dl className="m-0 grid min-w-0 gap-3">
        {figures.map(({ key, label, value }) => (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[14px] text-[var(--fg-2)]">{label}</dt>
            <dd className="m-0 text-[16px] text-[var(--fg-1)] [overflow-wrap:anywhere]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function GoalMetricsSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div role="progressbar" aria-label={label} aria-busy className="flex flex-col gap-3">
      <div className="h-6 w-24"><Skeleton variant="fill" grouped /></div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1">
          <div className="h-5 w-36 max-w-full"><Skeleton variant="fill" grouped /></div>
          <div className="h-6 w-24"><Skeleton variant="fill" grouped /></div>
        </div>
      ))}
    </div>
  )
}
