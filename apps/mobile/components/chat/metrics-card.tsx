import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { getMetricsRows } from '@orbit/shared/chat'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function MetricsCard({ metricsCard }: Readonly<{ metricsCard: MetricsCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const habitId = metricsCard.habitId
  const points = metricsCard.series ? mapCompletionSeries(metricsCard.series, i18n.language) : []
  const rows = getMetricsRows(metricsCard).map((row) => ({
    id: row.id,
    label: t(row.labelKey),
    control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'], maxWidth: '45%', textAlign: 'right' }}>{row.value ?? t('chat.metrics.noFigure')}</Text>,
  }))
  const body = !metricsCard.hasData
    ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.metrics.empty')}</Text>
    : points.some((point) => point.scheduled > 0)
      ? <BarChart points={points} label={t('chat.metrics.chartLabel')} />
      : undefined

  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <BlockFrame
        state="resting"
        title={habitId ? t('chat.metrics.habitTitle', { name: metricsCard.habitTitle ?? '' }) : t('chat.metrics.title')}
        count={null}
        items={rows}
        body={body}
        actions={<Button variant="ghost" size="sm" onClick={() => habitId ? router.push({ pathname: '/habits/[id]', params: { id: habitId } }) : router.push('/progress')}>{t(habitId ? 'chat.metrics.habitLink' : 'chat.metrics.progressLink')}</Button>}
      />
    </View>
  )
}
