'use client'

import { useLocale, useTranslations } from 'next-intl'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { PillLink } from '@/components/ui/pill-button'

export function MetricsCard({ metricsCard }: Readonly<{ metricsCard: MetricsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const habitId = metricsCard.habitId
  const habitTitle = metricsCard.habitTitle?.trim()
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, locale) : []
  const rows = getMetricsRows(metricsCard).map((row) => ({
    id: row.id,
    wrapLabel: true,
    label: t(row.labelKey),
    control: <span className="max-w-[45%] break-words text-right text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{row.value ?? t('chat.metrics.noFigure')}</span>,
  }))
  const body = !metricsCard.hasData
    ? <p className="text-sm text-[var(--fg-3)]">{t('chat.metrics.empty')}</p>
    : points.some((point) => point.scheduled > 0)
      ? <BarChart points={points} label={t('chat.metrics.chartLabel')} />
      : undefined

  return (
    <div className="mt-2 w-full md:max-w-[65ch]">
      <BlockFrame
        state="resting"
        title={habitId && habitTitle ? t('chat.metrics.habitTitle', { name: habitTitle }) : t('chat.metrics.title')}
        wrapTitle={Boolean(habitId && habitTitle)}
        count={null}
        items={rows}
        body={body}
        actions={<PillLink variant="ghost" size="sm" href={habitId ? `/habits/${habitId}` : '/progress'}>{t(habitId ? 'chat.metrics.habitLink' : 'chat.metrics.progressLink')}</PillLink>}
      />
    </div>
  )
}
