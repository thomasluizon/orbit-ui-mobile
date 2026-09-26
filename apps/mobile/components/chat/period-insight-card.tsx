import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { getInsightPages } from '@orbit/shared/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { mapCompletionSeries } from '@orbit/shared/utils'
import { BarChart } from '@/components/ui/bar-chart'
import { BlockFrame } from '@/components/ui/block-frame'
import { Pager } from '@/components/ui/pager'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PeriodInsightCard({ periodInsight }: Readonly<{ periodInsight: PeriodInsightData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [index, setIndex] = useState(0)
  const pages = getInsightPages(periodInsight)
  const page = pages[Math.min(index, pages.length - 1)] ?? pages[0]
  const points = periodInsight.series ? mapCompletionSeries(periodInsight.series, i18n.language) : []
  const figures = [
    { id: 'completionRate', value: `${periodInsight.completionRate}%` },
    { id: 'daysLogged', value: String(periodInsight.activeDays) },
    { id: 'currentStreak', value: String(periodInsight.currentStreak) },
    { id: 'bestStreak', value: String(periodInsight.bestStreak) },
  ]
  const rows: BlockFrameItem[] = index === 0 ? figures.map((figure) => ({
    id: figure.id,
    label: t(`chat.insight.${figure.id}`),
    control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{figure.value}</Text>,
  })) : []
  if (index === 0) {
    periodInsight.topHabits.forEach((habit, habitIndex) => rows.push({
      id: `top-${habitIndex}`,
      wrapLabel: true,
      label: `${t('chat.insight.topHabit')}: ${habit.name}`,
      control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{habit.completionRate}%</Text>,
    }))
    periodInsight.needsAttention.forEach((habit, habitIndex) => rows.push({
      id: `attention-${habitIndex}`,
      wrapLabel: true,
      label: `${t('chat.insight.needsAttention')}: ${habit.name}`,
      control: <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{habit.completionRate}%</Text>,
    }))
  }

  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <BlockFrame
        state="resting"
        title={t('chat.insight.title')}
        count={null}
        items={rows}
        body={<View style={{ gap: 12 }}>
          <Text accessibilityLiveRegion="polite" accessibilityLabel={t('chat.insight.pageAnnounce', { n: index + 1, total: pages.length, title: t(page.titleKey) })} style={{ color: tokens.fg1, fontSize: 14, fontFamily: 'Geist_500Medium' }}>
            {t(page.titleKey)}
          </Text>
          {index === 0 ? points.some((point) => point.scheduled > 0)
            ? <BarChart points={points} label={t('chat.insight.chartLabel')} />
            : null
            : <Text style={{ color: tokens.fg2, fontSize: 14 }}>{page.text}</Text>}
        </View>}
        actions={<View style={{ gap: 12 }}>
          <Pager
            index={index}
            count={pages.length}
            label={t('chat.insight.title')}
            backLabel={t('chat.insight.previous')}
            onBack={index > 0 ? () => setIndex(index - 1) : undefined}
            forwardSlot={<Button variant="ghost" size="sm" accessibleName={t('chat.insight.next')} disabled={index === pages.length - 1} onClick={() => setIndex(index + 1)}>{t('chat.insight.next')}</Button>}
          />
          {/* eslint-disable-next-line local/max-button-words -- #680 requires this destination chip copy. */}
          <Button variant="ghost" size="sm" accessibleName={t('chat.insight.progressLink')} onClick={() => router.push('/progress')}>{t('chat.insight.progressLink')}</Button>
        </View>}
      />
    </View>
  )
}
