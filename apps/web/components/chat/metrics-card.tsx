'use client'

import { HabitBlockRow } from './habit-block-row'

import { useLocale, useTranslations } from 'next-intl'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { metricsFigureLabelKey } from '@orbit/shared/chat/metrics-card-core'
import { CompactFigure, FigureList } from './compact-figure'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'

function chartBody(card: MetricsCardData, points: ReturnType<typeof mapCompletionSeries>, label: string, empty: React.ReactNode) {
  if (!card.hasData) return empty
  if (points.some((point) => point.scheduled > 0)) return <BarChart points={points} label={label} />
  return undefined
}

export function MetricsCard({ metricsCard: snapshot }: Readonly<{ metricsCard: MetricsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const metricsCard = snapshot
  const habitId = metricsCard.habitId
  const habitTitle = metricsCard.habitTitle?.trim()
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, locale) : []
  const rows = getMetricsRows(metricsCard).filter((row) => row.id === 'topHabit').map((row) => ({
    id: row.id,
    wrapLabel: true,
    wrapMeta: true,
    label: typeof row.value === 'string' ? <HabitBlockRow title={row.value} emoji={metricsCard.topHabitEmoji} meta={t(row.labelKey)} /> : t(row.labelKey),

    control: typeof row.value === 'string' ? undefined : <span className="max-w-[45%] break-words text-right text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{t('chat.metrics.noFigure')}</span>,
  }))
  const figures = getMetricsRows(metricsCard).filter((row) => row.id !== 'topHabit').slice(0, 3)

  const chart = chartBody(metricsCard, points, t('chat.metrics.chartLabel'), <p className="text-sm text-[var(--fg-3)]">{t('chat.metrics.empty')}</p>)

  return (
    <div className="w-full">
      <BlockFrame
        state="resting"
        title={habitId && habitTitle ? t('chat.metrics.habitTitle', { name: habitTitle }) : t('chat.metrics.title')}
        titleMode={habitId && habitTitle ? 'typed' : 'label'}
        count={null}
        items={rows}
        body={<FigureList>{metricsCard.periodMetrics ? <p className="text-sm text-[var(--fg-3)]">{formatReadWindow(metricsCard.periodMetrics.window, locale)}</p> : null}{figures.map(figure => <CompactFigure key={figure.id} value={figure.value ?? t('chat.metrics.noFigure')} unit={t(metricsFigureLabelKey(figure.id, figure.labelKey))} />)}{chart}</FigureList>}
      />
    </div>
  )
}
