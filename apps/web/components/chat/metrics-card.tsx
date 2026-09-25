'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

export function MetricsCard({ metricsCard }: Readonly<{ metricsCard: MetricsCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const habitId = metricsCard.habitId
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, locale) : []
  const rows = getMetricsRows(metricsCard).map((row) => ({
    id: row.id,
    label: t(row.labelKey),
    control: <span className="max-w-[45%] truncate text-right text-base tabular-nums text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }} title={row.value ?? undefined}>{row.value ?? t('chat.metrics.noFigure')}</span>,
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
        title={habitId ? t('chat.metrics.habitTitle', { name: metricsCard.habitTitle ?? '' }) : t('chat.metrics.title')}
        count={null}
        items={rows}
        body={body}
        actions={<Button variant="ghost" size="sm" onClick={() => router.push(habitId ? `/habits/${habitId}` : '/progress')}>{t(habitId ? 'chat.metrics.habitLink' : 'chat.metrics.progressLink')}</Button>}
      />
    </div>
  )
}
