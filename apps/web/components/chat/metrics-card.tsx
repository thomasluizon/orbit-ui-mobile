'use client'

import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { useHabitMetrics } from '@/hooks/use-habits'
import { useProgressRetrospective } from '@/hooks/use-retrospective'
import { liveMetricsCard, metricsFigureLabelKey } from '@orbit/shared/chat/metrics-card-core'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import { StatTile } from '@/components/ui/stat-tile'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { PillLink } from '@/components/ui/pill-button'

export function MetricsCard({ metricsCard: snapshot }: Readonly<{ metricsCard: MetricsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const period = z.enum(['week', 'month', 'quarter', 'semester', 'year']).safeParse(snapshot.period)
  const retrospective = useProgressRetrospective(period.success ? period.data : 'month', period.success && !snapshot.habitId)
  const habit = useHabitMetrics(snapshot.habitId ?? null)
  const query = snapshot.habitId ? habit : retrospective
  const frameState = liveBlockState(query, { staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void query.refetch() } })
  const metricsCard = liveMetricsCard(snapshot, habit.data, retrospective.data)
  const habitId = metricsCard.habitId
  const habitTitle = metricsCard.habitTitle?.trim()
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, locale) : []
  const rows = getMetricsRows(metricsCard).filter((row) => row.id === 'topHabit').map((row) => ({
    id: row.id,
    wrapLabel: true,
    wrapMeta: row.id === 'topHabit',
    label: row.id === 'topHabit' && typeof row.value === 'string' ? <PersonalTextDetails outset>{row.value}</PersonalTextDetails> : t(row.labelKey),
    meta: row.id === 'topHabit' && typeof row.value === 'string' ? t(row.labelKey) : undefined,
    control: row.id === 'topHabit' && typeof row.value === 'string' ? undefined : <span className="max-w-[45%] break-words text-right text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{row.value ?? t('chat.metrics.noFigure')}</span>,
  }))
  const figures = getMetricsRows(metricsCard).filter((row) => row.id !== 'topHabit').slice(0, 3)

  const chart = !metricsCard.hasData
    ? <p className="text-sm text-[var(--fg-3)]">{t('chat.metrics.empty')}</p>
    : points.some((point) => point.scheduled > 0)
      ? <BarChart points={points} label={t('chat.metrics.chartLabel')} />
      : undefined

  return (
    <div className="w-full">
      <BlockFrame
        {...frameState}
        title={habitId && habitTitle ? t('chat.metrics.habitTitle', { name: habitTitle }) : t('chat.metrics.title')}
        titleMode={habitId && habitTitle ? 'typed' : 'label'}
        count={null}
        items={rows}
        body={<div className="flex flex-col gap-4">{chart}<div className="flex flex-wrap gap-4">{figures.map((figure) => figure.value == null ? <StatTile key={figure.id} state="empty" label={t(metricsFigureLabelKey(figure.id, figure.labelKey))} emptyLabel={t('chat.metrics.noFigure')} /> : <StatTile key={figure.id} value={figure.value} label={t(metricsFigureLabelKey(figure.id, figure.labelKey))} />)}</div></div>}
        actions={<>{query.isError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}<PillLink variant="ghost" size="sm" href={habitId ? `/habits/${habitId}` : '/progress'}>{t(habitId ? 'chat.metrics.habitLink' : 'chat.metrics.progressLink')}</PillLink></>}
      />
    </div>
  )
}
