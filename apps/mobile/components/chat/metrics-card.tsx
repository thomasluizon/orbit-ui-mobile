import { useTranslation } from 'react-i18next'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { Text, View, useWindowDimensions } from 'react-native'
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
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function chartBody(card: MetricsCardData, points: ReturnType<typeof mapCompletionSeries>, label: string, empty: React.ReactNode) {
  if (!card.hasData) return empty
  if (points.some((point) => point.scheduled > 0)) return <BarChart points={points} label={label} />
  return undefined
}

export function MetricsCard({ metricsCard: snapshot }: Readonly<{ metricsCard: MetricsCardData }>) {
  const { t, i18n } = useTranslation()
  const navigate = useChatNavigation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { fontScale } = useWindowDimensions()
  const period = z.enum(['week', 'month', 'quarter', 'semester', 'year']).safeParse(snapshot.period)
  const retrospective = useProgressRetrospective(period.success ? period.data : 'month', period.success && !snapshot.habitId)
  const habit = useHabitMetrics(snapshot.habitId ?? null)
  const query = snapshot.habitId ? habit : retrospective
  const queryState = snapshot.habitId || period.success ? query : { isPending: false, isError: false, isRefetchError: false }
  const frameState = liveBlockState(queryState, { staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void query.refetch() } })
  const metricsCard = liveMetricsCard(snapshot, habit.data, period.success ? retrospective.data : undefined)
  const habitId = metricsCard.habitId
  const habitTitle = metricsCard.habitTitle?.trim()
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, i18n.language) : []
  const rows = getMetricsRows(metricsCard).filter((row) => row.id === 'topHabit').map((row) => ({
    id: row.id,
    wrapLabel: true,
    wrapMeta: true,
    label: typeof row.value === 'string' ? <PersonalTextDetails outset>{row.value}</PersonalTextDetails> : t(row.labelKey),
    meta: typeof row.value === 'string' ? t(row.labelKey) : undefined,
    control: typeof row.value === 'string' ? undefined : <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'], maxWidth: '45%', textAlign: 'right' }}>{t('chat.metrics.noFigure')}</Text>,
  }))
  const figures = getMetricsRows(metricsCard).filter((row) => row.id !== 'topHabit').slice(0, 3)

  const chart = chartBody(metricsCard, points, t('chat.metrics.chartLabel'), <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.metrics.empty')}</Text>)

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame
        {...frameState}
        title={habitId && habitTitle ? t('chat.metrics.habitTitle', { name: habitTitle }) : t('chat.metrics.title')}
        titleMode={habitId && habitTitle ? 'typed' : 'label'}
        count={null}
        items={rows}
        body={<View style={{ gap: 16 }}>{chart}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{figures.map((figure) => <View key={figure.id} style={{ flexBasis: 192 * fontScale, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>{figure.value == null ? <StatTile key={figure.id} state="empty" label={t(metricsFigureLabelKey(figure.id, figure.labelKey))} emptyLabel={t('chat.metrics.noFigure')} /> : <StatTile key={figure.id} value={figure.value} label={t(metricsFigureLabelKey(figure.id, figure.labelKey))} />}</View>)}</View></View>}
        actions={<>{query.isError ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}<Button variant="ghost" size="sm" accessibilityRole="link" onClick={() => { if (habitId) navigate({ pathname: '/habits/[id]', params: { id: habitId } }); else navigate('/progress') }}>{t(habitId ? 'chat.metrics.habitLink' : 'chat.metrics.progressLink')}</Button></>}
      />
    </View>
  )
}
