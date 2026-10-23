import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { Text, View } from 'react-native'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const { t, i18n } = useTranslation()
  const navigate = useChatNavigation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [expanded, setExpanded] = useState(false)
  const pages = getInsightPages(periodInsight)
  const points = periodInsight.series ? mapCompletionSeries(periodInsight.series, i18n.language) : []
  const figures = [
    { id: 'completionRate', value: `${periodInsight.completionRate}%` },
    { id: 'daysLogged', value: String(periodInsight.activeDays) },
    ...(expanded ? [
      { id: 'currentStreak', value: String(periodInsight.currentStreak) },
      { id: 'bestStreak', value: String(periodInsight.bestStreak) },
    ] : []),
  ]
  const rows: BlockFrameItem[] = figures.map((figure) => ({
    id: figure.id,
    label: t(`chat.insight.${figure.id}`),
    control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{figure.value}</Text>,
  }))
  if (expanded) {
    periodInsight.topHabits.forEach((habit, habitIndex) => rows.push({
      id: `top-${habitIndex}`,
      wrapLabel: true,
      label: <PersonalTextDetails outset>{`${t('chat.insight.topHabit')}: ${habit.name}`}</PersonalTextDetails>,
      control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{habit.completionRate}%</Text>,
    }))
    periodInsight.needsAttention.forEach((habit, habitIndex) => rows.push({
      id: `attention-${habitIndex}`,
      wrapLabel: true,
      label: <PersonalTextDetails outset>{`${t('chat.insight.needsAttention')}: ${habit.name}`}</PersonalTextDetails>,
      control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{habit.completionRate}%</Text>,
    }))
  }

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame
        state="resting"
        title={t('chat.insight.title')}
        count={null}
        items={rows}
        body={<View accessibilityLiveRegion="polite" testID="insight-detail-announcement" style={{ minWidth: 0, gap: 12 }}>
          <Text style={{ color: tokens.fg3, fontSize: 14 }}>{formatReadWindow({ from: periodInsight.dateFrom, to: periodInsight.dateTo }, i18n.language)}</Text>
          {points.some(point => point.scheduled > 0) ? <BarChart points={points} label={t('chat.insight.chartLabel')} /> : null}
          {expanded ? pages.slice(1).map(page => <View key={page.titleKey} style={{ gap: 8 }}><Text style={{ color: tokens.fg1, fontSize: 14 }}>{t(page.titleKey)}</Text><Text style={{ color: tokens.fg2, fontSize: 14 }}>{page.text}</Text></View>) : null}
        </View>}
        actions={<>
          <Button variant="ghost" size="sm" expanded={expanded} accessibleName={t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')}</Button>
          <Button variant="ghost" size="sm" accessibilityRole="link" accessibleName={t('chat.insight.progressLink')} onClick={() => navigate('/progress')}>{t('chat.insight.progressLink')}</Button>
        </>}
      />
    </View>
  )
}
