import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { formatAPIDate } from '@orbit/shared/utils'
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
    const logged = occurrence
      ? item.isBadHabit ? occurrence.isLoggedInRange : occurrence.isCompleted
      : false
    return {
      id: item.id,
      label: (
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.habitList.open', { name: item.title })} onPress={() => router.push({ pathname: '/habits/[id]', params: { id: item.id } })} style={{ minHeight: 44, minWidth: 0, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 }}>
          <View style={{ width: 32, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: tokens.bgWell }}><Text>{item.emoji ?? '•'}</Text></View>
          <Text numberOfLines={1} style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 }}>{item.title}</Text>
        </Pressable>
      ),
      meta: item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      control: occurrence ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} onPress={() => {
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <StatusRing status={logged ? 'done' : item.status === 'overdue' ? 'overdue' : 'empty'} size={24} label={t(logged ? 'chat.habitList.logged' : 'chat.habitList.pending')} />
        </Pressable>
      ) : undefined,
    }
  })

  return (
    <View style={{ width: '100%', marginTop: 8 }}>
      <BlockFrame state="resting" title={t('chat.habitList.title')} count={t('chat.habitList.count', { shown: visibleItems.length, total: habitList.items.length })} items={rows} actions={visibleItems.length < habitList.items.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShownCount((count) => count + PAGE_SIZE)}>{t('chat.habitList.more')}</Button>
      ) : undefined} />
    </View>
  )
}
