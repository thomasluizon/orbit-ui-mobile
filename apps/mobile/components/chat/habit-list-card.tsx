import { PersonalText } from '@/components/ui/personal-text'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { useTranslation } from 'react-i18next'
import type { HabitListCard as HabitListCardData } from '@orbit/shared/types/chat'
import { daySummaryLogControl, habitReadStatusKey } from '@orbit/shared/chat/day-summary-core'
import { formatAPIDate, getAccountDay } from '@orbit/shared/utils'
import { BlockFrame, useReadActionScope } from './read-block-frame'
import { StatusRing } from '@/components/ui/status-ring'
import { Button } from '@/components/ui/pill-button'
import { useHabits, useLogHabit } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const PAGE_SIZE = 3

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const { t } = useTranslation()
  const navigate = useChatNavigation()
  const logHabit = useLogHabit()
  const readScope = useReadActionScope()
  const [today] = useState(() => formatAPIDate(new Date()))
  const occurrenceDate = habitList.date ?? today
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
    const snapshotStatusKey = habitReadStatusKey(item.status, item.isBadHabit)
    const control = daySummaryLogControl(occurrence, item.status === 'overdue', readScope ? { ...readScope, date: occurrenceDate, today: getAccountDay(new Date(), readScope.timeZone) } : undefined)
    const logged = control.logged
    const unavailable = logHabit.isPending || control.undoUnavailable || !control.writeAllowed
    return {
      id: item.id,
      label: (
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.habitList.open', { name: item.title })} onPress={() => navigate({ pathname: '/habits/[id]', params: { id: item.id, ...(habitList.date ? { date: habitList.date } : {}) } })} style={({ pressed }) => ({ minHeight: TOUCH_TARGET_MIN, minWidth: 0, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 32, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: tokens.bgWell }}><Text>{item.emoji ?? '•'}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}><PersonalText style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 19.6 }}>{item.title}</PersonalText></View>
        </Pressable>
      ),
      meta: habitList.read && snapshotStatusKey ? t(snapshotStatusKey) : item.status === 'overdue' ? t('chat.habitList.overdue') : undefined,
      control: occurrence ? (
        <Pressable disabled={unavailable} accessibilityRole="button" accessibilityLabel={t(logged ? 'chat.habitList.unlog' : 'chat.habitList.log', { name: item.title })} onPress={() => {
          if (unavailable || !daySummaryLogControl(occurrence, false, readScope ? { ...readScope, date: occurrenceDate, today: getAccountDay(new Date(), readScope.timeZone) } : undefined).writeAllowed) return
          logHabit.mutate({ habitId: item.id, date: occurrenceDate, intent: logged ? 'unlog' : 'log' })
        }} style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' }}>
          <StatusRing status={control.status} size={24} label={t(control.statusKey)} />
        </Pressable>
      ) : undefined,
    }
  })

  return (
    <View style={{ width: '100%' }}>
      <BlockFrame state="resting" title={t(habitList.read ? 'nav.habits' : habitList.scope === 'all' ? 'chat.habitList.allTitle' : 'chat.habitList.title')} count={habitList.items.length === 0 ? null : t('chat.habitList.count', { shown: visibleItems.length, total: habitList.totalCount ?? habitList.items.length })} items={rows} body={habitList.items.length === 0 ? (
        <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14 }}>{t(habitList.read || habitList.scope === 'all' ? 'chat.habitList.allEmpty' : 'chat.habitList.todayEmpty')}</Text>
      ) : undefined} actions={visibleItems.length < habitList.items.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShownCount((count) => count + PAGE_SIZE)}>{t('chat.habitList.more')}</Button>
      ) : undefined} />
    </View>
  )
}
