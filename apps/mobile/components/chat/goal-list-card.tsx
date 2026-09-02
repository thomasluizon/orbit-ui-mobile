import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { formatGoalMetricsDate } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function percentage(item: GoalListCardItem): number {
  return item.target <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

export function GoalListCard({ goalList, onOpenGoal }: Readonly<{ goalList: GoalListCardData; onOpenGoal?: (id: string) => void }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const items = goalList.items.map((item) => {
    const value = percentage(item)
    const progress = t('chat.goalList.progress', { current: item.current, target: item.target, unit: item.unit })
    const deadline = item.deadline ? t('chat.goalList.deadline', { date: formatGoalMetricsDate(item.deadline, i18n.language) }) : null
    return {
      id: item.id,
      label: <Pressable accessibilityRole="button" onPress={() => onOpenGoal?.(item.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text numberOfLines={1} style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 }}>{item.title}</Text></Pressable>,
      meta: deadline ? `${progress} · ${deadline}` : progress,
      control: value === 100
        ? <StatusRing status="done" size={28} label={t('chat.goalList.done', { name: item.title })} />
        : <ProgressRing value={value} size={28} label={t('chat.goalList.ring', { name: item.title })} />,
    }
  })
  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <BlockFrame state="resting" title={t('chat.goalList.title')} items={items} actions={(
        <View style={{ alignItems: 'flex-start', gap: 12 }}>
          {items.length === 0 ? <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14 }}>{t('chat.goalList.empty')}</Text> : null}
          <Button variant="ghost" size="sm" onClick={() => router.push('/progress')}>{t('chat.goalList.progressLink')}</Button>
        </View>
      )} />
    </View>
  )
}
