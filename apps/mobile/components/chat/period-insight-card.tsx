import { HabitBlockRow } from './habit-block-row'
import { ChevronsUp, ChevronDown } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatReadWindow } from '@orbit/shared/chat/read-block-core'
import { Text, View } from 'react-native'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from './read-block-frame'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const { t, i18n } = useTranslation()
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
      label: <HabitBlockRow title={habit.name} emoji={habit.emoji} meta={t('chat.insight.topHabit')} label={`${t('chat.insight.topHabit')}: ${habit.name}`} />,
      control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{habit.completionRate}%</Text>,
    }))
    periodInsight.needsAttention.forEach((habit, habitIndex) => rows.push({
      id: `attention-${habitIndex}`,
      wrapLabel: true,
      label: <HabitBlockRow title={habit.name} emoji={habit.emoji} meta={t('chat.insight.needsAttention')} label={`${t('chat.insight.needsAttention')}: ${habit.name}`} />,
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
          <IconButton label={t(expanded ? 'chat.readBlock.less' : 'chat.habitList.more')} expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronsUp size={20} accessible={false} /> : <ChevronDown size={20} accessible={false} />}</IconButton>
        </>}
      />
    </View>
  )
}
