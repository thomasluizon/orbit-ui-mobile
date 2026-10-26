import { HabitBlockRow } from './habit-block-row'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { metricsFigureLabelKey } from '@orbit/shared/chat/metrics-card-core'
import { CompactFigure, FigureList } from './compact-figure'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function chartBody(card: MetricsCardData, points: ReturnType<typeof mapCompletionSeries>, label: string, empty: React.ReactNode) {
  if (!card.hasData) return empty
  if (points.some((point) => point.scheduled > 0)) return <BarChart points={points} label={label} />
  return undefined
}

export function MetricsCard({ metricsCard: snapshot }: Readonly<{ metricsCard: MetricsCardData }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const metricsCard = snapshot
  const habitId = metricsCard.habitId
  const habitTitle = metricsCard.habitTitle?.trim()
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, i18n.language) : []
  const rows = getMetricsRows(metricsCard).filter((row) => row.id === 'topHabit').map((row) => ({
    id: row.id,
    wrapLabel: true,
    wrapMeta: true,
    label: typeof row.value === 'string' ? <HabitBlockRow title={row.value} emoji={metricsCard.topHabitEmoji} meta={t(row.labelKey)} /> : t(row.labelKey),

    control: typeof row.value === 'string' ? undefined : <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'], maxWidth: '45%', textAlign: 'right' }}>{t('chat.metrics.noFigure')}</Text>,
  }))
  const figures = getMetricsRows(metricsCard).filter((row) => row.id !== 'topHabit').slice(0, 3)

  const chart = chartBody(metricsCard, points, t('chat.metrics.chartLabel'), <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.metrics.empty')}</Text>)

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame
        state="resting"
        title={habitId && habitTitle ? t('chat.metrics.habitTitle', { name: habitTitle }) : t('chat.metrics.title')}
        titleMode={habitId && habitTitle ? 'typed' : 'label'}
        count={null}
        items={rows}
        body={<FigureList>{metricsCard.periodMetrics ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{formatReadWindow(metricsCard.periodMetrics.window, i18n.language)}</Text> : null}{figures.map(figure => <CompactFigure key={figure.id} value={figure.value ?? t('chat.metrics.noFigure')} unit={t(metricsFigureLabelKey(figure.id, figure.labelKey))} />)}{chart}</FigureList>}
      />
    </View>
  )
}
