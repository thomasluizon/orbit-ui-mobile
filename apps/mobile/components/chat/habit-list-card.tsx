import { PersonalText } from '@/components/ui/personal-text'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { formatAPIDate, isHabitDoneForRange } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const PAGE_SIZE = 3

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const logHabit = useLogHabit()
  const [occurrenceDate] = useState(() => formatAPIDate(new Date()))
  const occurrences = useHabits({
    dateFrom: occurrenceDate,
    dateTo: occurrenceDate,
    includeGeneral: true,
    includeOverdue: true,
  })
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [shownCount, setShownCount] = useState(PAGE_SIZE)
  const visibleItems = habitList.items.slice(0, shownCount)
  const rows = visibleItems.map((item) => {
    const occurrence = occurrences.data?.habitsById.get(item.id)
    const logged = occurrence ? isHabitDoneForRange(occurrence) : false
    return {
      id: item.id,
      label: (
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.habitList.open', { name: item.title })} onPress={() => router.push({ pathname: '/habits/[id]', params: { id: item.id } })} style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, minWidth: 0, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: tokens.bgWell }}><Text>{item.emoji ?? '•'}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}><PersonalText style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 }}>{item.title}</PersonalText></View>
        </Pressable>
      ),
      meta: item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      control: occurrence ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} onPress={() => {
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' }}>
          <StatusRing status={logged ? 'done' : item.status === 'overdue' ? 'overdue' : 'empty'} size={24} label={t(logged ? 'chat.habitList.logged' : 'chat.habitList.pending')} />
        </Pressable>
      ) : undefined,
    }
  })

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame state="resting" title={t(habitList.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title')} count={habitList.items.length === 0 ? null : t('chat.habitList.count', { shown: visibleItems.length, total: habitList.items.length })} items={rows} body={habitList.items.length === 0 ? (
        <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14 }}>{t(habitList.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty')}</Text>
      ) : undefined} actions={visibleItems.length < habitList.items.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShownCount((count) => count + PAGE_SIZE)}>{t('chat.habitList.more')}</Button>
      ) : undefined} />
    </View>
  )
}
