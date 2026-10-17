import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PersonalText } from '@/components/ui/personal-text'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { useState } from 'react'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { formatGoalMetricsDate, getGoalMetricsStatusPresentation } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useGoals } from '@/hooks/use-goals'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import { Button } from '@/components/ui/pill-button'
import { Badge } from '@/components/ui/badge'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function percentage(item: Pick<GoalListCardItem, 'current' | 'target'>): number {
  return item.target <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

function GoalName({ name, onOpen }: Readonly<{ name: string; onOpen: () => void }>) {
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <InsetFocusPressable accessibilityRole="button" accessibilityLabel={name} onPress={onOpen}
    onFocus={() => setFocused(true)}
    onBlur={() => setFocused(false)}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, alignSelf: 'stretch', marginHorizontal: -8, minWidth: 0, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: pressed || focused || hovered ? tokens.bgHover : 'transparent' })}>
    <PersonalText style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 }}>{name}</PersonalText>
  </InsetFocusPressable>
}

export function GoalListCard({ goalList, onOpenGoal }: Readonly<{ goalList: GoalListCardData; onOpenGoal?: (id: string) => void }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const goals = useGoals()
  const missing = goals.data != null && goalList.items.some((item) => !goals.data.goalsById.has(item.id))
  const frameState = liveBlockState(goals, { stale: missing, staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void goals.refetch() } })
  const items = goalList.items.map((snapshot) => {
    const live = goals.data?.goalsById.get(snapshot.id)
    const item = live ? { ...snapshot, title: live.title, current: live.currentValue, target: live.targetValue, unit: live.unit, deadline: live.deadline, trackingStatus: live.trackingStatus } : snapshot
    const derived = live?.isProgressDerived && live.linkedHabits.length > 0 ? `${t('goals.linkedHabits')}: ${live.linkedHabits.map((habit) => habit.title).join(', ')}` : null
    const value = percentage(item)
    const progress = t('chat.goalList.progress', { current: item.current, target: item.target, unit: item.unit })
    const deadline = item.deadline ? t('chat.goalList.deadline', { date: formatGoalMetricsDate(item.deadline, i18n.language) }) : null
    const projected = item.projectedCompletionDate ? t('chat.goalList.projected', { date: formatGoalMetricsDate(item.projectedCompletionDate, i18n.language) }) : null
    const tracking = getGoalMetricsStatusPresentation(item.trackingStatus)
    return {
      id: item.id,
      wrapLabel: true,
      label: <View style={{ minWidth: 0, gap: 8, alignItems: 'flex-start' }}>{onOpenGoal ? <GoalName name={item.title} onOpen={() => onOpenGoal(item.id)} /> : <PersonalTextDetails outset>{item.title}</PersonalTextDetails>}{tracking ? <Badge variant="outline">{t(tracking.labelKey)}</Badge> : null}<View style={{ alignSelf: 'stretch' }}><ProgressBar value={value} label={t('chat.goalList.ring', { name: item.title })} /></View>{derived ? <PersonalTextDetails outset>{derived}</PersonalTextDetails> : null}</View>,
      meta: [progress, deadline, projected].filter(Boolean).join(' · '),
      wrapMeta: true,

    }
  })
  return (
    <View style={{ width: '100%' }}>
      <BlockFrame {...frameState} title={t('chat.goalList.title')} items={items} body={items.length === 0 ? <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14 }}>{t('chat.goalList.empty')}</Text> : undefined} actions={(
        <>
          {goals.isError ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}
          {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
          <Button variant="ghost" size="sm" onClick={() => router.push('/progress/goals')}>{t('chat.goalList.progressLink')}</Button>
        </>
      )} />
    </View>
  )
}
